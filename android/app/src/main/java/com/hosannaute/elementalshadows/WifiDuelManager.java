package com.hosannaute.elementalshadows;

import android.app.Activity;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ProtocolException;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Hardened 100% offline Android LAN & Wi-Fi Hotspot 2-Player Duet transport (v3.2.0).
 * - Bounded UTF-8 frame reader (MAX_LINE_BYTES = 16384) + socket read/heartbeat timeouts (B-1)
 * - Dedicated stateLock around all socket & MulticastLock transitions + 16ms UI frame JS coalescing (B-2)
 * - Strict numeric LAN IPv4 + Dojo port allowlists with zero DNS lookups (B-3)
 * - U+2028 / U+2029 escaping after JSONObject.quote() & async-cached local IP off JavaBridge (B-4)
 * - Cryptographic Dojo Room PIN + mutual HMAC-SHA256 challenge-response & Host challenger approval (W-1)
 * - Protected outbound queue that never evicts control packets (go, over, lobby, rm, in, lob) (W-5)
 * - Lifecycle-aware UDP beacon/scan & MulticastLock pause/resume + immediate connectingSocket abort (L-1, L-5)
 */
public class WifiDuelManager {
    public static final int DISCOVERY_PORT = 42870;
    public static final int BASE_TCP_PORT = 42871;
    public static final int MAX_TCP_PORT = BASE_TCP_PORT + 19;
    public static final int MAX_LINE_BYTES = 16384;

    private static final String BEACON_PREFIX = "ES_DUEL|v2|";
    private static final String PROBE_TOKEN = "ES_PROBE|v2";
    private static final byte[] BEACON_HMAC_KEY =
            "ElementalShadows_DojoBeacon_v3.2_HMAC".getBytes(StandardCharsets.UTF_8);

    private static final int CONNECT_TIMEOUT_MS = 4500;
    private static final int HANDSHAKE_TIMEOUT_MS = 3500;
    private static final int KNOCK_APPROVAL_TIMEOUT_MS = 15000;
    private static final int PEER_SO_TIMEOUT_MS = 2500;
    private static final long PEER_HEARTBEAT_TX_MS = 1800L;
    private static final long PEER_IDLE_TIMEOUT_MS = 12000L;

    private static final int SEND_QUEUE_CAPACITY = 128;
    private static final long JS_COALESCE_FRAME_MS = 16L;
    private static final int MAX_JS_BATCH_ITEMS = 40;
    private static final int MAX_CONCURRENT_HANDSHAKES = 4;

    private final Activity activity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final SecureRandom secureRandom = new SecureRandom();

    private final Object stateLock = new Object();
    private final AtomicInteger sessionSeq = new AtomicInteger(0);
    private final AtomicInteger scanSeq = new AtomicInteger(0);
    private final AtomicInteger knockSeq = new AtomicInteger(0);
    private final AtomicInteger activeHandshakes = new AtomicInteger(0);

    private volatile WebView webView;
    private volatile boolean destroyed = false;
    private boolean paused = false;
    private boolean scanningActive = false;
    private boolean resumeScanOnResume = false;

    private ServerSocket serverSocket;
    private Socket connectingSocket;
    private Socket pendingKnockSocket;
    private int pendingKnockId = 0;
    private Boolean pendingKnockDecision = null;
    private Socket peerSocket;
    private DatagramSocket beaconSocket;
    private DatagramSocket scanSocket;
    private WifiManager.MulticastLock multicastLock;

    private OutboundQueue sendQueue;
    private volatile String hostName = "SHADOW";
    private volatile String hostEl = "water";
    private volatile String clientName = "SHADOW";
    private volatile String clientEl = "fire";
    private int activeTcpPort = BASE_TCP_PORT;
    private String activeRole = "";
    private String roomPin = "";
    private String hostId = "";

    private volatile String cachedLocalIp = "192.168.43.1";
    private volatile long cachedIpUpdatedAt = 0L;

    // Rate-limit failed handshakes per source IP to neutralize LAN port-scanner sniping
    private final Map<String, int[]> failedAuthByIp = new HashMap<>();

    // Coalesced per-frame UI JS dispatch state
    private final Object jsLock = new Object();
    private final List<JsItem> pendingJsItems = new ArrayList<>();
    private boolean jsFlushScheduled = false;
    private long lastJsFlushAt = 0L;
    private final Runnable jsFlushRunnable = this::flushJsOnUiThread;

    private static final class JsItem {
        final boolean isEvent;
        String payload;
        final boolean isPureSnapshot;

        JsItem(boolean isEvent, String payload, boolean isPureSnapshot) {
            this.isEvent = isEvent;
            this.payload = payload;
            this.isPureSnapshot = isPureSnapshot;
        }
    }

    /**
     * Bounded UTF-8 newline frame reader. Never allocates beyond MAX_LINE_BYTES (16384),
     * preventing OOM or GC stalls on malformed or newline-less streams.
     */
    static final class BoundedUtf8Reader {
        private final InputStream in;
        private final byte[] chunk = new byte[4096];
        private int chunkPos = 0;
        private int chunkLen = 0;
        private final byte[] lineBuf = new byte[MAX_LINE_BYTES];

        BoundedUtf8Reader(InputStream in) {
            this.in = in;
        }

        String readLine() throws IOException {
            int lineLen = 0;
            while (true) {
                if (chunkPos >= chunkLen) {
                    int n = in.read(chunk);
                    if (n < 0) {
                        if (lineLen == 0) return null;
                        return decodeLine(lineLen);
                    }
                    chunkPos = 0;
                    chunkLen = n;
                }
                while (chunkPos < chunkLen) {
                    byte b = chunk[chunkPos++];
                    if (b == '\n') {
                        return decodeLine(lineLen);
                    }
                    if (lineLen >= MAX_LINE_BYTES) {
                        throw new ProtocolException("TCP frame exceeded MAX_LINE_BYTES (" + MAX_LINE_BYTES + ")");
                    }
                    lineBuf[lineLen++] = b;
                }
            }
        }

        private String decodeLine(int len) {
            if (len > 0 && lineBuf[len - 1] == '\r') {
                len--;
            }
            return new String(lineBuf, 0, len, StandardCharsets.UTF_8);
        }
    }

    /**
     * Bounded outbound packet queue that coalesces stale snapshots and strictly protects
     * control packets (go, over, lobby, rm, in, lob) from eviction.
     */
    static final class OutboundQueue {
        private final ArrayDeque<String> deque = new ArrayDeque<>(SEND_QUEUE_CAPACITY);
        private boolean closed = false;

        static boolean isPureStateSnapshot(String line) {
            return line.startsWith("{\"t\":\"st\"") && !line.contains("\"ev\":");
        }

        static boolean isDroppable(String line) {
            return isPureStateSnapshot(line)
                    || line.startsWith("{\"t\":\"ping\"")
                    || line.startsWith("{\"t\":\"pong\"")
                    || line.startsWith("{\"t\":\"hb\"");
        }

        static boolean isInputPacket(String line) {
            return line.startsWith("{\"t\":\"in\"");
        }

        synchronized void offerPacket(String line) {
            if (closed || line == null || line.isEmpty() || line.length() > MAX_LINE_BYTES) return;

            // Replace older pure state snapshots so 30Hz state never queues latency behind inputs/events
            if (isPureStateSnapshot(line)) {
                deque.removeIf(OutboundQueue::isPureStateSnapshot);
            } else if (line.startsWith("{\"t\":\"st\"") && deque.size() >= 6) {
                deque.removeIf(OutboundQueue::isPureStateSnapshot);
            }

            if (deque.size() >= SEND_QUEUE_CAPACITY) {
                // 1) Evict oldest droppable telemetry/snapshot packet first
                boolean freed = removeFirstMatching(OutboundQueue::isDroppable);
                if (!freed) {
                    // Queue contains only control/event packets: never evict go/over/lobby/rm/lob!
                    if (isDroppable(line)) {
                        return;
                    }
                    if (isInputPacket(line)) {
                        // Only evict oldest input if saturated with inputs
                        int inCount = 0;
                        for (String item : deque) {
                            if (isInputPacket(item)) inCount++;
                        }
                        if (inCount >= SEND_QUEUE_CAPACITY / 2) {
                            removeFirstMatching(OutboundQueue::isInputPacket);
                        } else {
                            return;
                        }
                    } else {
                        // Critical control packet (go, over, lobby, rm, lob): evict a snapshot-with-ev or oldest input if needed
                        if (!removeFirstMatching(s -> s.startsWith("{\"t\":\"st\""))) {
                            if (!removeFirstMatching(OutboundQueue::isInputPacket)) {
                                return;
                            }
                        }
                    }
                }
            }
            deque.addLast(line);
            notifyAll();
        }

        private boolean removeFirstMatching(java.util.function.Predicate<String> pred) {
            Iterator<String> it = deque.iterator();
            while (it.hasNext()) {
                if (pred.test(it.next())) {
                    it.remove();
                    return true;
                }
            }
            return false;
        }

        synchronized String pollFirst(long timeoutMs) throws InterruptedException {
            if (deque.isEmpty() && !closed && timeoutMs > 0) {
                wait(timeoutMs);
            }
            if (closed || deque.isEmpty()) return null;
            return deque.pollFirst();
        }

        synchronized void drainTo(List<String> batch, int maxItems) {
            while (!deque.isEmpty() && batch.size() < maxItems) {
                batch.add(deque.pollFirst());
            }
        }

        synchronized void close() {
            closed = true;
            deque.clear();
            notifyAll();
        }
    }

    public WifiDuelManager(Activity activity) {
        this.activity = activity;
        refreshCachedLocalIpAsync();
    }

    public void attachWebView(WebView view) {
        this.webView = view;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public String getLocalIp() {
        // Never enumerate NetworkInterfaces synchronously on WebView's JavaBridge thread (B-4)
        long now = SystemClock.elapsedRealtime();
        if (now - cachedIpUpdatedAt > 5000L) {
            refreshCachedLocalIpAsync();
        }
        return cachedLocalIp;
    }

    @JavascriptInterface
    public void updateHostMeta(String name, String el) {
        this.hostName = sanitizeToken(name, "SHADOW");
        this.hostEl = sanitizeElement(el, "water");
    }

    @JavascriptInterface
    public void startHost(String name, String el) {
        final int sid;
        final String pin = String.format(Locale.US, "%04d", 1000 + secureRandom.nextInt(9000));
        final String hid = randomHex(8);
        synchronized (stateLock) {
            if (destroyed) return;
            sid = sessionSeq.incrementAndGet();
            scanSeq.incrementAndGet();
            scanningActive = false;
            resumeScanOnResume = false;
            closeSocketsLocked();
            this.hostName = sanitizeToken(name, "SHADOW");
            this.hostEl = sanitizeElement(el, "water");
            this.activeRole = "host";
            this.roomPin = pin;
            this.hostId = hid;
            failedAuthByIp.clear();
            syncMulticastLockLocked();
        }

        Thread hostThread = new Thread(() -> runHostLoop(sid, pin, hid), "ES-WifiHost-" + sid);
        hostThread.setDaemon(true);
        hostThread.start();
    }

    @JavascriptInterface
    public void approveChallenger(int reqId, boolean accept) {
        synchronized (stateLock) {
            if (pendingKnockSocket != null && pendingKnockId == reqId) {
                pendingKnockDecision = accept;
                stateLock.notifyAll();
            }
        }
    }

    @JavascriptInterface
    public void startScan() {
        final int scId;
        synchronized (stateLock) {
            if (destroyed) return;
            scId = scanSeq.incrementAndGet();
            closeDatagramQuietly(scanSocket);
            scanSocket = null;
            scanningActive = true;
            if (paused) {
                resumeScanOnResume = true;
                syncMulticastLockLocked();
                return;
            }
            syncMulticastLockLocked();
        }

        Thread scanThread = new Thread(() -> runScanLoop(scId), "ES-WifiScan-" + scId);
        scanThread.setDaemon(true);
        scanThread.start();
    }

    @JavascriptInterface
    public void stopScan() {
        synchronized (stateLock) {
            scanSeq.incrementAndGet();
            scanningActive = false;
            resumeScanOnResume = false;
            closeDatagramQuietly(scanSocket);
            scanSocket = null;
            syncMulticastLockLocked();
        }
    }

    @JavascriptInterface
    public void connectToHost(String rawTarget, int port) {
        connectToHostAuth(rawTarget, port, "", this.clientName, this.clientEl);
    }

    @JavascriptInterface
    public void connectToHostAuth(String rawTarget, int port, String rawPin, String cName, String cEl) {
        // Perform ZERO NetworkInterface syscalls on JavaBridge; resolve & validate off-thread (B-3, B-4)
        final int sid;
        synchronized (stateLock) {
            if (destroyed) return;
            sid = sessionSeq.incrementAndGet();
            scanSeq.incrementAndGet();
            scanningActive = false;
            resumeScanOnResume = false;
            closeSocketsLocked();
            this.activeRole = "client";
            this.clientName = sanitizeToken(cName, "SHADOW");
            this.clientEl = sanitizeElement(cEl, "fire");
            syncMulticastLockLocked();
        }

        final String safeTarget = rawTarget == null ? "" : rawTarget.trim();
        final String safePin = rawPin == null ? "" : rawPin.trim();
        Thread clientThread = new Thread(
                () -> runClientConnect(sid, safeTarget, port, safePin),
                "ES-WifiClient-" + sid
        );
        clientThread.setDaemon(true);
        clientThread.start();
    }

    @JavascriptInterface
    public void send(String jsonLine) {
        if (jsonLine == null || jsonLine.isEmpty() || jsonLine.length() > MAX_LINE_BYTES) return;
        OutboundQueue q;
        synchronized (stateLock) {
            q = this.sendQueue;
        }
        if (q != null) {
            q.offerPacket(jsonLine);
        }
    }

    @JavascriptInterface
    public void disconnect() {
        synchronized (stateLock) {
            sessionSeq.incrementAndGet();
            scanSeq.incrementAndGet();
            activeRole = "";
            scanningActive = false;
            resumeScanOnResume = false;
            roomPin = "";
            closeSocketsLocked();
            syncMulticastLockLocked();
        }
    }

    public void onPause() {
        final int scId;
        synchronized (stateLock) {
            if (destroyed || paused) return;
            paused = true;
            resumeScanOnResume = scanningActive;
            scId = scanSeq.incrementAndGet();
            closeDatagramQuietly(scanSocket);
            scanSocket = null;
            closeDatagramQuietly(beaconSocket);
            beaconSocket = null;
            syncMulticastLockLocked();
        }
        if (scId < 0) { /* keep compiler happy */ }
    }

    public void onResume() {
        boolean restartBeacon = false;
        int hostSid = 0;
        int tcpPort = BASE_TCP_PORT;
        String hid = "";
        boolean restartScan = false;

        synchronized (stateLock) {
            if (destroyed || !paused) return;
            paused = false;
            if ("host".equals(activeRole) && peerSocket == null && serverSocket != null && !serverSocket.isClosed()) {
                restartBeacon = true;
                hostSid = sessionSeq.get();
                tcpPort = activeTcpPort;
                hid = hostId;
            } else if (resumeScanOnResume && activeRole.isEmpty() && peerSocket == null) {
                restartScan = true;
                scanningActive = true;
            }
            resumeScanOnResume = false;
            syncMulticastLockLocked();
        }

        refreshCachedLocalIpAsync();
        if (restartBeacon) {
            final int fSid = hostSid;
            final int fPort = tcpPort;
            final String fHid = hid;
            Thread beaconThread = new Thread(() -> runBeaconLoop(fSid, fPort, fHid), "ES-WifiBeacon-" + fSid);
            beaconThread.setDaemon(true);
            beaconThread.start();
        } else if (restartScan) {
            startScan();
        }
    }

    public void destroy() {
        synchronized (stateLock) {
            destroyed = true;
            sessionSeq.incrementAndGet();
            scanSeq.incrementAndGet();
            activeRole = "";
            scanningActive = false;
            resumeScanOnResume = false;
            closeSocketsLocked();
            syncMulticastLockLocked();
        }
        synchronized (jsLock) {
            pendingJsItems.clear();
            jsFlushScheduled = false;
        }
        mainHandler.removeCallbacks(jsFlushRunnable);
        webView = null;
    }

    private void runHostLoop(int sid, String pin, String hid) {
        String localIp = refreshCachedLocalIpSync();
        ServerSocket ss = null;
        int boundPort = BASE_TCP_PORT;
        for (int p = BASE_TCP_PORT; p <= MAX_TCP_PORT; p++) {
            try {
                ServerSocket candidate = new ServerSocket();
                candidate.setReuseAddress(true);
                candidate.bind(new InetSocketAddress(p));
                ss = candidate;
                boundPort = p;
                break;
            } catch (Exception ignored) { }
        }

        boolean startBeaconNow = false;
        synchronized (stateLock) {
            if (ss == null || sid != sessionSeq.get() || destroyed || !"host".equals(activeRole)) {
                closeServerQuietly(ss);
                syncMulticastLockLocked();
                if (ss == null && sid == sessionSeq.get() && !destroyed) {
                    emitEvent("error", "Could not open local Wi-Fi server port.", null);
                }
                return;
            }
            serverSocket = ss;
            activeTcpPort = boundPort;
            startBeaconNow = !paused;
            syncMulticastLockLocked();
        }

        String shortCode = makeShortCode(localIp, boundPort);
        try {
            JSONObject extra = new JSONObject();
            extra.put("ip", localIp);
            extra.put("port", boundPort);
            extra.put("shortCode", shortCode);
            extra.put("pin", pin);
            extra.put("fullCode", shortCode + "-" + pin);
            emitEvent("host_ready", "Waiting for Player 2 on Wi-Fi or Hotspot...", extra);
        } catch (Exception ignored) { }

        if (startBeaconNow) {
            final int tcpPort = boundPort;
            Thread beaconThread = new Thread(() -> runBeaconLoop(sid, tcpPort, hid), "ES-WifiBeacon-" + sid);
            beaconThread.setDaemon(true);
            beaconThread.start();
        }

        try {
            ss.setSoTimeout(800);
            while (isSessionActive(sid) && getPeerSocket() == null) {
                Socket candidate;
                try {
                    candidate = ss.accept();
                } catch (SocketTimeoutException ignored) {
                    continue;
                } catch (IOException acceptErr) {
                    break;
                }
                if (candidate == null) continue;
                if (!isSessionActive(sid) || getPeerSocket() != null) {
                    closeSocketQuietly(candidate);
                    break;
                }
                String candIp = candidate.getInetAddress() != null ? candidate.getInetAddress().getHostAddress() : "";
                if (!isAllowedLanIpv4(candIp) || isIpRateLimited(candIp)
                        || activeHandshakes.get() >= MAX_CONCURRENT_HANDSHAKES) {
                    closeSocketQuietly(candidate);
                    continue;
                }

                // Authenticate challenger on a bounded helper thread so bystanders can NEVER stall ServerSocket.accept()
                activeHandshakes.incrementAndGet();
                Thread hsThread = new Thread(
                        () -> handleIncomingChallenger(sid, pin, hid, candidate, candIp),
                        "ES-WifiHs-" + sid
                );
                hsThread.setDaemon(true);
                hsThread.start();
            }
        } catch (Exception e) {
            if (isSessionActive(sid) && getPeerSocket() == null) {
                emitEvent("error", "Host connection error: " + safeMsg(e), null);
            }
        } finally {
            closeServerQuietly(ss);
            synchronized (stateLock) {
                if (serverSocket == ss) serverSocket = null;
                syncMulticastLockLocked();
            }
        }
    }

    private void handleIncomingChallenger(int sid, String expectedPin, String hid, Socket cand, String candIp) {
        boolean promoted = false;
        BoundedUtf8Reader reader = null;
        try {
            configureRealtimeSocket(cand, HANDSHAKE_TIMEOUT_MS);
            BufferedWriter writer = new BufferedWriter(
                    new OutputStreamWriter(cand.getOutputStream(), StandardCharsets.UTF_8)
            );
            reader = new BoundedUtf8Reader(cand.getInputStream());

            String sNonce = randomHex(16);
            JSONObject chal = new JSONObject();
            chal.put("t", "hs_chal");
            chal.put("v", 2);
            chal.put("sNonce", sNonce);
            chal.put("hostId", hid);
            writer.write(chal.toString());
            writer.write('\n');
            writer.flush();

            String respLine = reader.readLine();
            if (respLine == null || respLine.isEmpty()) {
                recordAuthFailure(candIp);
                return;
            }
            JSONObject resp = new JSONObject(respLine);
            if (!"hs_resp".equals(resp.optString("t")) || resp.optInt("v") != 2) {
                recordAuthFailure(candIp);
                return;
            }

            String mode = resp.optString("mode", "");
            String cNonce = resp.optString("cNonce", "");
            String joinerName = sanitizeToken(resp.optString("name", "CHALLENGER"), "CHALLENGER");
            String joinerEl = sanitizeElement(resp.optString("el", "fire"), "fire");
            if (cNonce.length() < 16 || cNonce.length() > 64) {
                recordAuthFailure(candIp);
                return;
            }

            String sProof = "";
            if ("pin".equals(mode)) {
                String clientProof = resp.optString("proof", "");
                String expectedProof = hmacSha256Hex(
                        expectedPin.getBytes(StandardCharsets.UTF_8),
                        "C|" + sNonce + "|" + cNonce + "|" + hid
                );
                if (!constantTimeEqualsHex(clientProof, expectedProof)) {
                    recordAuthFailure(candIp);
                    sendHandshakeError(writer, "Incorrect 4-digit Dojo PIN.");
                    return;
                }
                sProof = hmacSha256Hex(
                        expectedPin.getBytes(StandardCharsets.UTF_8),
                        "S|" + cNonce + "|" + sNonce + "|" + hid
                );
            } else if ("knock".equals(mode)) {
                int reqId = knockSeq.incrementAndGet();
                synchronized (stateLock) {
                    if (!isSessionActiveLocked(sid) || peerSocket != null) return;
                    if (pendingKnockSocket != null && !pendingKnockSocket.isClosed()) {
                        sendHandshakeError(writer, "Host is reviewing another Challenger — enter the 4-digit PIN.");
                        return;
                    }
                    pendingKnockSocket = cand;
                    pendingKnockId = reqId;
                    pendingKnockDecision = null;
                }

                try {
                    JSONObject waitMsg = new JSONObject();
                    waitMsg.put("t", "hs_wait");
                    waitMsg.put("msg", "Waiting for Host to accept your challenge...");
                    writer.write(waitMsg.toString());
                    writer.write('\n');
                    writer.flush();

                    JSONObject knockEv = new JSONObject();
                    knockEv.put("reqId", reqId);
                    knockEv.put("name", joinerName);
                    knockEv.put("el", joinerEl);
                    knockEv.put("ip", candIp);
                    emitEvent("challenger_knock", joinerName + " wants to join your Dojo!", knockEv);

                    long deadline = SystemClock.elapsedRealtime() + KNOCK_APPROVAL_TIMEOUT_MS;
                    Boolean decision = null;
                    synchronized (stateLock) {
                        while (isSessionActiveLocked(sid) && peerSocket == null
                                && pendingKnockSocket == cand && pendingKnockDecision == null) {
                            long rem = deadline - SystemClock.elapsedRealtime();
                            if (rem <= 0) break;
                            stateLock.wait(Math.min(500L, rem));
                        }
                        if (pendingKnockSocket == cand) {
                            decision = pendingKnockDecision;
                            pendingKnockSocket = null;
                            pendingKnockId = 0;
                            pendingKnockDecision = null;
                        }
                    }

                    if (!Boolean.TRUE.equals(decision)) {
                        recordAuthFailure(candIp);
                        emitEvent("challenger_cleared", "", null);
                        sendHandshakeError(writer, "Host declined or timed out — enter the 4-digit Dojo PIN.");
                        return;
                    }
                } finally {
                    synchronized (stateLock) {
                        if (pendingKnockSocket == cand) {
                            pendingKnockSocket = null;
                            pendingKnockId = 0;
                            pendingKnockDecision = null;
                        }
                    }
                }
            } else {
                recordAuthFailure(candIp);
                return;
            }

            // Atomically claim the Host session slot and attach OutboundQueue BEFORE emitting connected event
            String sessionTok = randomHex(16);
            final OutboundQueue hostQueue = new OutboundQueue();
            synchronized (stateLock) {
                if (!isSessionActiveLocked(sid) || peerSocket != null) {
                    hostQueue.close();
                    return;
                }
                peerSocket = cand;
                sendQueue = hostQueue;
                // Close any lingering knock socket if a PIN joiner beat it
                if (pendingKnockSocket != null && pendingKnockSocket != cand) {
                    closeSocketQuietly(pendingKnockSocket);
                    pendingKnockSocket = null;
                    pendingKnockId = 0;
                    pendingKnockDecision = null;
                }
                closeDatagramQuietly(beaconSocket);
                beaconSocket = null;
                closeServerQuietly(serverSocket);
                serverSocket = null;
                syncMulticastLockLocked();
                promoted = true;
            }

            JSONObject ok = new JSONObject();
            ok.put("t", "hs_ok");
            ok.put("v", 2);
            ok.put("tok", sessionTok);
            if (!sProof.isEmpty()) ok.put("sProof", sProof);
            writer.write(ok.toString());
            writer.write('\n');
            writer.flush();

            configureRealtimeSocket(cand, PEER_SO_TIMEOUT_MS);
            try {
                JSONObject extra = new JSONObject();
                extra.put("role", "host");
                extra.put("peerIp", candIp);
                extra.put("peerName", joinerName);
                extra.put("peerEl", joinerEl);
                emitEvent("connected", "Challenger joined your Dojo!", extra);
            } catch (Exception ignored) { }

            final BoundedUtf8Reader sessionReader = reader;
            Thread sessionThread = new Thread(
                    () -> runPeerSession(sid, cand, sessionReader, hostQueue),
                    "ES-WifiHostPeer-" + sid
            );
            sessionThread.setDaemon(true);
            sessionThread.start();
        } catch (Exception ignored) {
            recordAuthFailure(candIp);
            if (promoted) {
                synchronized (stateLock) {
                    if (peerSocket == cand) peerSocket = null;
                }
            }
            closeSocketQuietly(cand);
        } finally {
            activeHandshakes.decrementAndGet();
            if (!promoted) {
                closeSocketQuietly(cand);
            }
        }
    }

    private void sendHandshakeError(BufferedWriter writer, String msg) {
        try {
            JSONObject err = new JSONObject();
            err.put("t", "hs_err");
            err.put("msg", msg);
            writer.write(err.toString());
            writer.write('\n');
            writer.flush();
        } catch (Exception ignored) { }
    }

    private void runBeaconLoop(int sid, int tcpPort, String hid) {
        DatagramSocket ds = null;
        try {
            ds = new DatagramSocket(null);
            ds.setReuseAddress(true);
            ds.setBroadcast(true);
            try {
                ds.bind(new InetSocketAddress(DISCOVERY_PORT));
            } catch (Exception bindErr) {
                ds.bind(new InetSocketAddress(0));
            }
            ds.setSoTimeout(500);

            synchronized (stateLock) {
                if (!isSessionActiveLocked(sid) || paused || !"host".equals(activeRole) || peerSocket != null) {
                    closeDatagramQuietly(ds);
                    return;
                }
                closeDatagramQuietly(beaconSocket);
                beaconSocket = ds;
            }

            byte[] rxBuf = new byte[256];
            long lastBroadcast = 0L;

            while (isBeaconActive(sid, ds)) {
                long now = SystemClock.elapsedRealtime();
                if (now - lastBroadcast >= 550L) {
                    lastBroadcast = now;
                    String localIp = refreshCachedLocalIpSync();
                    byte[] payload = buildSignedBeaconPayload(localIp, tcpPort, hid);
                    for (InetAddress bcast : getBroadcastAddresses()) {
                        try {
                            ds.send(new DatagramPacket(payload, payload.length, bcast, DISCOVERY_PORT));
                        } catch (Exception ignored) { }
                    }
                }

                long waitMs = Math.max(40L, 550L - (SystemClock.elapsedRealtime() - lastBroadcast));
                try {
                    ds.setSoTimeout((int) Math.min(550L, waitMs));
                    DatagramPacket rx = new DatagramPacket(rxBuf, rxBuf.length);
                    ds.receive(rx);
                    String msg = new String(rx.getData(), 0, rx.getLength(), StandardCharsets.UTF_8).trim();
                    InetAddress rxAddr = rx.getAddress();
                    if (PROBE_TOKEN.equals(msg) && rxAddr != null
                            && isAllowedLanIpv4(rxAddr.getHostAddress())) {
                        String localIp = cachedLocalIp;
                        byte[] reply = buildSignedBeaconPayload(localIp, tcpPort, hid);
                        ds.send(new DatagramPacket(reply, reply.length, rxAddr, rx.getPort()));
                    }
                } catch (SocketTimeoutException ignored) {
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) {
        } finally {
            closeDatagramQuietly(ds);
            synchronized (stateLock) {
                if (beaconSocket == ds) beaconSocket = null;
            }
        }
    }

    private void runScanLoop(int scId) {
        DatagramSocket ds = null;
        try {
            ds = new DatagramSocket(null);
            ds.setReuseAddress(true);
            ds.setBroadcast(true);
            try {
                ds.bind(new InetSocketAddress(DISCOVERY_PORT));
            } catch (Exception e) {
                ds.bind(new InetSocketAddress(0));
            }
            ds.setSoTimeout(600);

            synchronized (stateLock) {
                if (scId != scanSeq.get() || destroyed || paused || !scanningActive) {
                    closeDatagramQuietly(ds);
                    return;
                }
                closeDatagramQuietly(scanSocket);
                scanSocket = ds;
            }

            byte[] rxBuf = new byte[512];
            byte[] probeBytes = PROBE_TOKEN.getBytes(StandardCharsets.UTF_8);
            long lastProbe = 0L;
            Map<String, Long> lastEmitByIp = new LinkedHashMap<>();

            while (isScanActive(scId, ds)) {
                long now = SystemClock.elapsedRealtime();
                if (now - lastProbe >= 900L) {
                    lastProbe = now;
                    refreshCachedLocalIpSync();
                    for (InetAddress bcast : getBroadcastAddresses()) {
                        try {
                            ds.send(new DatagramPacket(probeBytes, probeBytes.length, bcast, DISCOVERY_PORT));
                        } catch (Exception ignored) { }
                    }
                    String gatewayIp = guessHotspotGateway(cachedLocalIp);
                    InetAddress gw = parseAllowedLanInetAddress(gatewayIp);
                    if (gw != null) {
                        try {
                            ds.send(new DatagramPacket(probeBytes, probeBytes.length, gw, DISCOVERY_PORT));
                        } catch (Exception ignored) { }
                    }
                }

                try {
                    DatagramPacket rx = new DatagramPacket(rxBuf, rxBuf.length);
                    ds.receive(rx);
                    InetAddress srcAddr = rx.getAddress();
                    String srcIp = srcAddr != null ? srcAddr.getHostAddress() : "";
                    if (!isAllowedLanIpv4(srcIp)) continue;

                    String txt = new String(rx.getData(), 0, rx.getLength(), StandardCharsets.UTF_8).trim();
                    if (!txt.startsWith(BEACON_PREFIX)) continue;

                    String[] parts = txt.split("\\|");
                    // Format: ES_DUEL|v2|<name>|<el>|<ip>|<port>|<hostId>|<mac16>
                    if (parts.length < 8) continue;
                    String hName = sanitizeToken(parts[2], "SHADOW");
                    String hEl = sanitizeElement(parts[3], "water");
                    String advertisedIp = parts[4];
                    int hPort;
                    try {
                        hPort = Integer.parseInt(parts[5]);
                    } catch (Exception e) {
                        continue;
                    }
                    if (!isValidDojoPort(hPort)) continue;
                    String hid = sanitizeToken(parts[6], "");
                    String rxMac = parts[7];
                    if (hid.isEmpty() || rxMac.length() != 16) continue;

                    String signedCore = BEACON_PREFIX + parts[2] + "|" + parts[3] + "|" + advertisedIp + "|" + hPort + "|" + parts[6];
                    String expectedMac = hmacSha256Hex(BEACON_HMAC_KEY, signedCore).substring(0, 16);
                    if (!constantTimeEqualsHex(rxMac, expectedMac)) continue;

                    // Bind discovered host strictly to the actual UDP packet source IP (defeats IP spoofing)
                    String rateKey = srcIp + ":" + hPort;
                    Long prevAt = lastEmitByIp.get(rateKey);
                    long tNow = SystemClock.elapsedRealtime();
                    if (prevAt != null && tNow - prevAt < 400L) continue;
                    if (lastEmitByIp.size() >= 24 && !lastEmitByIp.containsKey(rateKey)) {
                        Iterator<String> it = lastEmitByIp.keySet().iterator();
                        if (it.hasNext()) { it.next(); it.remove(); }
                    }
                    lastEmitByIp.put(rateKey, tNow);

                    JSONObject extra = new JSONObject();
                    extra.put("name", hName);
                    extra.put("el", hEl);
                    extra.put("ip", srcIp);
                    extra.put("port", hPort);
                    extra.put("hostId", hid);
                    extra.put("shortCode", makeShortCode(srcIp, hPort));
                    emitEvent("host_found", "", extra);
                } catch (SocketTimeoutException ignored) {
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) {
        } finally {
            closeDatagramQuietly(ds);
            synchronized (stateLock) {
                if (scanSocket == ds) scanSocket = null;
                syncMulticastLockLocked();
            }
        }
    }

    private void runClientConnect(int sid, String rawTarget, int rawPort, String explicitPin) {
        String ownIp = refreshCachedLocalIpSync();

        // Parse optional "-PIN" or "#PIN" suffix and ":port"
        String cleaned = rawTarget == null ? "" : rawTarget.trim();
        String parsedPin = explicitPin == null ? "" : explicitPin.replaceAll("[^0-9]", "");
        int pinSep = Math.max(cleaned.lastIndexOf('-'), cleaned.lastIndexOf('#'));
        if (pinSep > 0 && pinSep < cleaned.length() - 1) {
            String tail = cleaned.substring(pinSep + 1).trim();
            if (tail.matches("\\d{4}")) {
                if (parsedPin.isEmpty()) parsedPin = tail;
                cleaned = cleaned.substring(0, pinSep).trim();
            }
        }
        if (parsedPin.length() != 4) {
            parsedPin = "";
        }

        int resolvedPort = rawPort > 0 ? rawPort : BASE_TCP_PORT;
        int colonIdx = cleaned.lastIndexOf(':');
        if (colonIdx > 0 && colonIdx < cleaned.length() - 1) {
            try {
                resolvedPort = Integer.parseInt(cleaned.substring(colonIdx + 1).trim());
            } catch (Exception e) {
                resolvedPort = -1;
            }
            cleaned = cleaned.substring(0, colonIdx).trim();
        }

        String resolvedIp = expandRoomCode(cleaned, ownIp);
        InetAddress targetAddr = parseAllowedLanInetAddress(resolvedIp);
        if (targetAddr == null || !isValidDojoPort(resolvedPort)) {
            synchronized (stateLock) {
                if (sid == sessionSeq.get() && !destroyed) {
                    activeRole = "";
                    emitEvent("error", "Enter a valid local Wi-Fi / Hotspot Dojo Code or LAN IPv4 address.", null);
                }
            }
            return;
        }

        Socket sock = new Socket();
        boolean promoted = false;
        try {
            synchronized (stateLock) {
                if (!isSessionActiveLocked(sid) || !"client".equals(activeRole)) {
                    closeSocketQuietly(sock);
                    return;
                }
                // Track connectingSocket BEFORE blocking connect(..., 4500) so disconnect()/destroy() aborts immediately (L-5)
                connectingSocket = sock;
            }

            sock.connect(new InetSocketAddress(targetAddr, resolvedPort), CONNECT_TIMEOUT_MS);
            configureRealtimeSocket(sock, HANDSHAKE_TIMEOUT_MS);

            BoundedUtf8Reader reader = new BoundedUtf8Reader(sock.getInputStream());
            BufferedWriter writer = new BufferedWriter(
                    new OutputStreamWriter(sock.getOutputStream(), StandardCharsets.UTF_8)
            );

            // Step 1: Read Host cryptographic challenge
            String chalLine = reader.readLine();
            if (chalLine == null || chalLine.isEmpty()) {
                throw new ProtocolException("Host closed before handshake.");
            }
            JSONObject chal = new JSONObject(chalLine);
            if (!"hs_chal".equals(chal.optString("t")) || chal.optInt("v") != 2) {
                throw new ProtocolException("Incompatible Dojo protocol.");
            }
            String sNonce = chal.optString("sNonce", "");
            String hid = chal.optString("hostId", "");
            if (sNonce.length() < 16 || hid.isEmpty()) {
                throw new ProtocolException("Invalid Host challenge.");
            }

            // Step 2: Send PIN HMAC proof or 1-Tap Knock request
            String cNonce = randomHex(16);
            boolean usePin = parsedPin.length() == 4;
            JSONObject resp = new JSONObject();
            resp.put("t", "hs_resp");
            resp.put("v", 2);
            resp.put("cNonce", cNonce);
            resp.put("name", this.clientName);
            resp.put("el", this.clientEl);
            if (usePin) {
                resp.put("mode", "pin");
                resp.put("proof", hmacSha256Hex(
                        parsedPin.getBytes(StandardCharsets.UTF_8),
                        "C|" + sNonce + "|" + cNonce + "|" + hid
                ));
            } else {
                resp.put("mode", "knock");
            }
            writer.write(resp.toString());
            writer.write('\n');
            writer.flush();

            // Step 3: Read Host verification result (or hs_wait while Host taps ACCEPT)
            String resLine = reader.readLine();
            if (resLine == null) throw new ProtocolException("Connection rejected by Host.");
            JSONObject res = new JSONObject(resLine);
            if ("hs_wait".equals(res.optString("t"))) {
                emitEvent("waiting_approval", res.optString("msg", "Waiting for Host to tap ACCEPT..."), null);
                sock.setSoTimeout(KNOCK_APPROVAL_TIMEOUT_MS + 1000);
                resLine = reader.readLine();
                if (resLine == null) throw new ProtocolException("Host did not accept in time.");
                res = new JSONObject(resLine);
            }

            if ("hs_err".equals(res.optString("t"))) {
                String errMsg = res.optString("msg", "Connection declined by Host.");
                if (isSessionActive(sid)) {
                    synchronized (stateLock) { activeRole = ""; }
                    emitEvent("error", errMsg, null);
                }
                return;
            }
            if (!"hs_ok".equals(res.optString("t"))) {
                throw new ProtocolException("Unexpected handshake response.");
            }

            // Mutual authentication when PIN was supplied: verify Host actually possesses the 4-digit PIN (anti-spoof!)
            if (usePin) {
                String sProof = res.optString("sProof", "");
                String expectedServerProof = hmacSha256Hex(
                        parsedPin.getBytes(StandardCharsets.UTF_8),
                        "S|" + cNonce + "|" + sNonce + "|" + hid
                );
                if (!constantTimeEqualsHex(sProof, expectedServerProof)) {
                    if (isSessionActive(sid)) {
                        synchronized (stateLock) { activeRole = ""; }
                        emitEvent("error", "Rejected spoofed Dojo host (PIN verification failed).", null);
                    }
                    return;
                }
            }

            final OutboundQueue clientQueue = new OutboundQueue();
            synchronized (stateLock) {
                if (!isSessionActiveLocked(sid) || !"client".equals(activeRole)) {
                    clientQueue.close();
                    return;
                }
                if (connectingSocket == sock) connectingSocket = null;
                peerSocket = sock;
                sendQueue = clientQueue;
                promoted = true;
            }

            configureRealtimeSocket(sock, PEER_SO_TIMEOUT_MS);
            try {
                JSONObject extra = new JSONObject();
                extra.put("role", "client");
                extra.put("peerIp", resolvedIp);
                emitEvent("connected", "Connected to Host Dojo!", extra);
            } catch (Exception ignored) { }

            runPeerSession(sid, sock, reader, clientQueue);
        } catch (Exception e) {
            if (isSessionActive(sid) && !promoted) {
                synchronized (stateLock) { activeRole = ""; }
                emitEvent("error", "Could not reach " + resolvedIp + ":" + resolvedPort + " — check Wi-Fi/Hotspot or Dojo PIN.", null);
            }
        } finally {
            synchronized (stateLock) {
                if (connectingSocket == sock) connectingSocket = null;
            }
            if (!promoted) {
                closeSocketQuietly(sock);
            }
        }
    }

    private void runPeerSession(int sid, Socket sock, BoundedUtf8Reader reader, OutboundQueue queue) {
        synchronized (stateLock) {
            if (!isSessionActiveLocked(sid)) {
                queue.close();
                closeSocketQuietly(sock);
                return;
            }
        }

        Thread writerThread = new Thread(() -> {
            List<String> batch = new ArrayList<>(16);
            long lastTxAt = SystemClock.elapsedRealtime();
            try {
                BufferedWriter out = new BufferedWriter(
                        new OutputStreamWriter(sock.getOutputStream(), StandardCharsets.UTF_8)
                );
                while (isSessionActive(sid) && !sock.isClosed()) {
                    String first = queue.pollFirst(500L);
                    long now = SystemClock.elapsedRealtime();
                    if (first == null) {
                        if (now - lastTxAt >= PEER_HEARTBEAT_TX_MS) {
                            out.write("{\"t\":\"hb\"}\n");
                            out.flush();
                            lastTxAt = now;
                        }
                        continue;
                    }
                    out.write(first);
                    out.write('\n');
                    batch.clear();
                    queue.drainTo(batch, 16);
                    for (int i = 0; i < batch.size(); i++) {
                        out.write(batch.get(i));
                        out.write('\n');
                    }
                    out.flush();
                    lastTxAt = now;
                }
            } catch (Exception ignored) {
                closeSocketQuietly(sock);
            }
        }, "ES-WifiWriter-" + sid);
        writerThread.setDaemon(true);
        writerThread.start();

        long lastRxAt = SystemClock.elapsedRealtime();
        try {
            while (isSessionActive(sid) && !sock.isClosed()) {
                try {
                    String line = reader.readLine();
                    if (line == null) break;
                    lastRxAt = SystemClock.elapsedRealtime();
                    if (!line.isEmpty() && !"{\"t\":\"hb\"}".equals(line)) {
                        emitRawMessage(line);
                    }
                } catch (SocketTimeoutException ste) {
                    if (SystemClock.elapsedRealtime() - lastRxAt > PEER_IDLE_TIMEOUT_MS) {
                        break;
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            queue.close();
            closeSocketQuietly(sock);
            boolean shouldNotify = false;
            synchronized (stateLock) {
                if (this.sendQueue == queue) this.sendQueue = null;
                if (this.peerSocket == sock) this.peerSocket = null;
                if (isSessionActiveLocked(sid)) {
                    this.activeRole = "";
                    shouldNotify = true;
                }
                syncMulticastLockLocked();
            }
            if (shouldNotify) {
                emitEvent("disconnected", "Opponent disconnected.", null);
            }
        }
    }

    private boolean isSessionActive(int sid) {
        synchronized (stateLock) {
            return isSessionActiveLocked(sid);
        }
    }

    private boolean isSessionActiveLocked(int sid) {
        return !destroyed && sid == sessionSeq.get();
    }

    private Socket getPeerSocket() {
        synchronized (stateLock) {
            return peerSocket;
        }
    }

    private boolean isBeaconActive(int sid, DatagramSocket ds) {
        synchronized (stateLock) {
            return !destroyed && !paused && sid == sessionSeq.get()
                    && "host".equals(activeRole) && peerSocket == null && beaconSocket == ds;
        }
    }

    private boolean isScanActive(int scId, DatagramSocket ds) {
        synchronized (stateLock) {
            return !destroyed && !paused && scanningActive
                    && scId == scanSeq.get() && scanSocket == ds;
        }
    }

    private boolean isIpRateLimited(String ip) {
        synchronized (stateLock) {
            int[] entry = failedAuthByIp.get(ip);
            if (entry == null) return false;
            int nowSec = (int) (SystemClock.elapsedRealtime() / 1000L);
            if (nowSec - entry[1] > 10) {
                failedAuthByIp.remove(ip);
                return false;
            }
            return entry[0] >= 5;
        }
    }

    private void recordAuthFailure(String ip) {
        if (ip == null || ip.isEmpty()) return;
        synchronized (stateLock) {
            if (failedAuthByIp.size() > 32 && !failedAuthByIp.containsKey(ip)) {
                failedAuthByIp.clear();
            }
            int nowSec = (int) (SystemClock.elapsedRealtime() / 1000L);
            int[] entry = failedAuthByIp.get(ip);
            if (entry == null || nowSec - entry[1] > 10) {
                failedAuthByIp.put(ip, new int[]{1, nowSec});
            } else {
                entry[0]++;
                entry[1] = nowSec;
            }
        }
    }

    private void configureRealtimeSocket(Socket sock, int soTimeoutMs) {
        try { sock.setTcpNoDelay(true); } catch (Exception ignored) { }
        try { sock.setKeepAlive(true); } catch (Exception ignored) { }
        try { sock.setTrafficClass(0x10); } catch (Exception ignored) { } // IPTOS_LOWDELAY
        try { sock.setSoTimeout(soTimeoutMs); } catch (Exception ignored) { }
    }

    private byte[] buildSignedBeaconPayload(String localIp, int tcpPort, String hid) {
        String core = BEACON_PREFIX
                + sanitizeToken(hostName, "SHADOW") + "|"
                + sanitizeElement(hostEl, "water") + "|"
                + localIp + "|"
                + tcpPort + "|"
                + hid;
        String mac16 = hmacSha256Hex(BEACON_HMAC_KEY, core).substring(0, 16);
        return (core + "|" + mac16).getBytes(StandardCharsets.UTF_8);
    }

    private static String sanitizeToken(String s, String fallback) {
        if (s == null) return fallback;
        String clean = s.replace("|", "")
                .replace("\n", "")
                .replace("\r", "")
                .replace("\u2028", "")
                .replace("\u2029", "")
                .trim();
        if (clean.isEmpty()) return fallback;
        return clean.length() > 18 ? clean.substring(0, 18) : clean;
    }

    private static String sanitizeElement(String el, String fallback) {
        if (el == null) return fallback;
        switch (el.trim().toLowerCase(Locale.US)) {
            case "water":
            case "fire":
            case "ice":
            case "earth":
            case "air":
            case "lightning":
            case "shadow":
            case "lava":
                return el.trim().toLowerCase(Locale.US);
            default:
                return fallback;
        }
    }

    static boolean isValidDojoPort(int port) {
        return port >= BASE_TCP_PORT && port <= MAX_TCP_PORT;
    }

    /**
     * Strictly validates dotted-quad numeric LAN / Hotspot IPv4 addresses.
     * Rejects hostnames (preventing DNS leaks), loopback (127.*), 0.*, multicast/broadcast, and public WAN IPs.
     */
    public static boolean isAllowedLanIpv4(String ip) {
        return parseAllowedLanOctets(ip) != null;
    }

    private static int[] parseAllowedLanOctets(String ip) {
        if (ip == null || ip.length() < 7 || ip.length() > 15) return null;
        String[] parts = ip.split("\\.", -1);
        if (parts.length != 4) return null;
        int[] oct = new int[4];
        for (int i = 0; i < 4; i++) {
            String p = parts[i];
            if (p.isEmpty() || p.length() > 3) return null;
            for (int c = 0; c < p.length(); c++) {
                char ch = p.charAt(c);
                if (ch < '0' || ch > '9') return null;
            }
            if (p.length() > 1 && p.charAt(0) == '0') return null;
            int val;
            try {
                val = Integer.parseInt(p);
            } catch (NumberFormatException e) {
                return null;
            }
            if (val < 0 || val > 255) return null;
            oct[i] = val;
        }
        int o0 = oct[0], o1 = oct[1], o2 = oct[2], o3 = oct[3];
        if (o0 == 255 && o1 == 255 && o2 == 255 && o3 == 255) return null;
        boolean rfc1918 = (o0 == 10)
                || (o0 == 172 && o1 >= 16 && o1 <= 31)
                || (o0 == 192 && o1 == 168);
        boolean linkLocal = (o0 == 169 && o1 == 254);
        boolean cgNatTether = (o0 == 100 && o1 >= 64 && o1 <= 127);
        return (rfc1918 || linkLocal || cgNatTether) ? oct : null;
    }

    private static InetAddress parseAllowedLanInetAddress(String ip) {
        int[] oct = parseAllowedLanOctets(ip);
        if (oct == null) return null;
        try {
            return InetAddress.getByAddress(new byte[]{
                    (byte) oct[0], (byte) oct[1], (byte) oct[2], (byte) oct[3]
            });
        } catch (Exception e) {
            return null;
        }
    }

    static String expandRoomCode(String raw, String ownIp) {
        if (raw == null || raw.isEmpty()) return "";
        String[] parts = raw.split("\\.", -1);
        if (parts.length == 4) {
            return isAllowedLanIpv4(raw) ? raw : "";
        }
        if (parts.length == 2 && parts[0].matches("\\d{1,3}") && parts[1].matches("\\d{1,3}")) {
            String[] ownParts = (ownIp == null ? "" : ownIp).split("\\.");
            String candidate;
            if (ownParts.length == 4 && ("192".equals(ownParts[0]) || "10".equals(ownParts[0]) || "172".equals(ownParts[0]) || "100".equals(ownParts[0]))) {
                candidate = ownParts[0] + "." + ownParts[1] + "." + parts[0] + "." + parts[1];
            } else {
                candidate = "192.168." + parts[0] + "." + parts[1];
            }
            return isAllowedLanIpv4(candidate) ? candidate : "";
        }
        if (parts.length == 1 && raw.matches("\\d{1,3}")) {
            String[] ownParts = (ownIp == null ? "" : ownIp).split("\\.");
            String candidate = ownParts.length == 4
                    ? (ownParts[0] + "." + ownParts[1] + "." + ownParts[2] + "." + raw)
                    : ("192.168.43." + raw);
            return isAllowedLanIpv4(candidate) ? candidate : "";
        }
        return "";
    }

    private static String makeShortCode(String ip, int port) {
        if (ip == null) return "";
        String[] p = ip.split("\\.");
        if (p.length == 4 && "192".equals(p[0]) && "168".equals(p[1]) && port == BASE_TCP_PORT) {
            return p[2] + "." + p[3];
        }
        return port == BASE_TCP_PORT ? ip : (ip + ":" + port);
    }

    private static String guessHotspotGateway(String ownIp) {
        String[] p = (ownIp == null ? "" : ownIp).split("\\.");
        if (p.length == 4 && ("192".equals(p[0]) || "10".equals(p[0]) || "172".equals(p[0]) || "100".equals(p[0]))) {
            return p[0] + "." + p[1] + "." + p[2] + ".1";
        }
        return "192.168.43.1";
    }

    private void refreshCachedLocalIpAsync() {
        Thread t = new Thread(this::refreshCachedLocalIpSync, "ES-IpDetect");
        t.setDaemon(true);
        t.start();
    }

    private String refreshCachedLocalIpSync() {
        String detected = detectLocalIpv4Internal();
        this.cachedLocalIp = detected;
        this.cachedIpUpdatedAt = SystemClock.elapsedRealtime();
        return detected;
    }

    private String detectLocalIpv4Internal() {
        String hotspotIp = "";
        String wifiIp = "";
        String fallback = "";
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            if (nis == null) return cachedLocalIp;
            List<NetworkInterface> list = Collections.list(nis);
            for (NetworkInterface ni : list) {
                if (ni == null || ni.isLoopback() || !ni.isUp()) continue;
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase(Locale.US);
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("tun") || name.startsWith("dummy")) continue;
                boolean isHotspot = name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("softap")
                        || name.equals("wlan1") || name.equals("wlan2") || name.startsWith("tether");
                boolean isWifi = name.startsWith("wlan") || name.startsWith("p2p") || name.startsWith("eth") || name.startsWith("en");
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        String host = a.getHostAddress();
                        if (!isAllowedLanIpv4(host)) continue;
                        if (isHotspot && hotspotIp.isEmpty()) hotspotIp = host;
                        else if (isWifi && wifiIp.isEmpty()) wifiIp = host;
                        else if (fallback.isEmpty()) fallback = host;
                    }
                }
            }
        } catch (Exception ignored) { }
        if (!hotspotIp.isEmpty()) return hotspotIp;
        if (!wifiIp.isEmpty()) return wifiIp;
        return fallback.isEmpty() ? "192.168.43.1" : fallback;
    }

    private List<InetAddress> getBroadcastAddresses() {
        Set<InetAddress> set = new LinkedHashSet<>();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            if (nis != null) {
                for (NetworkInterface ni : Collections.list(nis)) {
                    if (ni == null || ni.isLoopback() || !ni.isUp()) continue;
                    String name = ni.getName() == null ? "" : ni.getName().toLowerCase(Locale.US);
                    if (name.startsWith("rmnet") || name.startsWith("tun") || name.startsWith("dummy")) continue;
                    for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                        InetAddress b = ia.getBroadcast();
                        if (b instanceof Inet4Address) set.add(b);
                    }
                }
            }
        } catch (Exception ignored) { }
        try {
            set.add(InetAddress.getByAddress(new byte[]{(byte) 255, (byte) 255, (byte) 255, (byte) 255}));
        } catch (Exception ignored) { }
        return new ArrayList<>(set);
    }

    /**
     * Must ONLY be called while holding stateLock! Eliminates all MulticastLock TOCTOU races (B-2, L-1).
     */
    private void syncMulticastLockLocked() {
        boolean needLock = !destroyed && !paused
                && (scanningActive || ("host".equals(activeRole) && peerSocket == null && serverSocket != null));
        try {
            if (needLock) {
                if (multicastLock != null && multicastLock.isHeld()) return;
                WifiManager wm = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    if (multicastLock == null) {
                        multicastLock = wm.createMulticastLock("ElementalShadowsDuel");
                        multicastLock.setReferenceCounted(false);
                    }
                    if (!multicastLock.isHeld()) {
                        multicastLock.acquire();
                    }
                }
            } else {
                WifiManager.MulticastLock lock = multicastLock;
                multicastLock = null;
                if (lock != null && lock.isHeld()) {
                    lock.release();
                }
            }
        } catch (Throwable ignored) { }
    }

    /**
     * Escapes U+2028 and U+2029 after JSONObject.quote() for Android 7.x (API 24-25) WebViews (B-4).
     */
    public static String jsQuote(String raw) {
        String quoted = JSONObject.quote(raw == null ? "" : raw);
        if (quoted.indexOf('\u2028') >= 0 || quoted.indexOf('\u2029') >= 0) {
            quoted = quoted.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
        }
        return quoted;
    }

    private void emitEvent(String type, String message, JSONObject extra) {
        try {
            JSONObject obj = extra != null ? extra : new JSONObject();
            obj.put("type", type);
            if (message != null && !message.isEmpty()) obj.put("message", message);
            enqueueJsItem(true, obj.toString(), false);
        } catch (Exception ignored) { }
    }

    private void emitRawMessage(String jsonLine) {
        boolean pureSt = OutboundQueue.isPureStateSnapshot(jsonLine);
        enqueueJsItem(false, jsonLine, pureSt);
    }

    private void enqueueJsItem(boolean isEvent, String payload, boolean isPureSnapshot) {
        if (destroyed) return;
        long delayMs = 0L;
        boolean shouldSchedule = false;
        synchronized (jsLock) {
            if (destroyed) return;
            if (isPureSnapshot) {
                // Coalesce any queued pure snapshot in the current 16ms UI frame window
                boolean replaced = false;
                for (int i = pendingJsItems.size() - 1; i >= 0; i--) {
                    JsItem existing = pendingJsItems.get(i);
                    if (existing.isPureSnapshot) {
                        existing.payload = payload;
                        replaced = true;
                        break;
                    }
                }
                if (!replaced && pendingJsItems.size() < MAX_JS_BATCH_ITEMS) {
                    pendingJsItems.add(new JsItem(false, payload, true));
                }
            } else if (isEvent || pendingJsItems.size() < MAX_JS_BATCH_ITEMS
                    || (!OutboundQueue.isDroppable(payload) && !OutboundQueue.isInputPacket(payload))) {
                pendingJsItems.add(new JsItem(isEvent, payload, false));
            }

            if (!jsFlushScheduled) {
                jsFlushScheduled = true;
                shouldSchedule = true;
                long elapsed = SystemClock.uptimeMillis() - lastJsFlushAt;
                delayMs = elapsed >= JS_COALESCE_FRAME_MS ? 0L : (JS_COALESCE_FRAME_MS - elapsed);
            }
        }
        if (shouldSchedule) {
            if (delayMs <= 0L) {
                mainHandler.post(jsFlushRunnable);
            } else {
                mainHandler.postDelayed(jsFlushRunnable, delayMs);
            }
        }
    }

    private void flushJsOnUiThread() {
        final List<JsItem> batch;
        synchronized (jsLock) {
            jsFlushScheduled = false;
            lastJsFlushAt = SystemClock.uptimeMillis();
            if (pendingJsItems.isEmpty() || destroyed) {
                pendingJsItems.clear();
                return;
            }
            batch = new ArrayList<>(pendingJsItems);
            pendingJsItems.clear();
        }

        WebView wv = webView;
        if (wv == null || destroyed) return;

        try {
            final String js;
            if (batch.size() == 1) {
                JsItem item = batch.get(0);
                String quoted = jsQuote(item.payload);
                if (item.isEvent) {
                    js = "window.__onWifiDuelEvent && window.__onWifiDuelEvent(JSON.parse(" + quoted + "))";
                } else {
                    js = "window.__onWifiDuelMsg && window.__onWifiDuelMsg(" + quoted + ")";
                }
            } else {
                JSONArray arr = new JSONArray();
                for (int i = 0; i < batch.size(); i++) {
                    JsItem item = batch.get(i);
                    JSONArray pair = new JSONArray();
                    pair.put(item.isEvent ? 0 : 1);
                    pair.put(item.payload);
                    arr.put(pair);
                }
                String quotedBatch = jsQuote(arr.toString());
                js = "(function(b){if(window.__onWifiDuelBatch){window.__onWifiDuelBatch(b);return;}"
                        + "for(var i=0;i<b.length;i++){var p=b[i];"
                        + "if(p[0]===0){window.__onWifiDuelEvent&&window.__onWifiDuelEvent(JSON.parse(p[1]));}"
                        + "else{window.__onWifiDuelMsg&&window.__onWifiDuelMsg(p[1]);}}})(JSON.parse(" + quotedBatch + "))";
            }
            wv.evaluateJavascript(js, null);
        } catch (Throwable ignored) { }
    }

    /**
     * Must ONLY be called while holding stateLock!
     */
    private void closeSocketsLocked() {
        if (sendQueue != null) {
            sendQueue.close();
            sendQueue = null;
        }
        closeSocketQuietly(connectingSocket);
        connectingSocket = null;
        if (pendingKnockSocket != null) {
            pendingKnockDecision = Boolean.FALSE;
            closeSocketQuietly(pendingKnockSocket);
            pendingKnockSocket = null;
            pendingKnockId = 0;
            stateLock.notifyAll();
        }
        closeSocketQuietly(peerSocket);
        peerSocket = null;
        closeServerQuietly(serverSocket);
        serverSocket = null;
        closeDatagramQuietly(beaconSocket);
        beaconSocket = null;
        closeDatagramQuietly(scanSocket);
        scanSocket = null;
    }

    private void closeSocketQuietly(Socket s) {
        if (s != null) { try { s.close(); } catch (Exception ignored) { } }
    }

    private void closeServerQuietly(ServerSocket ss) {
        if (ss != null) { try { ss.close(); } catch (Exception ignored) { } }
    }

    private void closeDatagramQuietly(DatagramSocket ds) {
        if (ds != null) { try { ds.close(); } catch (Exception ignored) { } }
    }

    private String randomHex(int numBytes) {
        byte[] b = new byte[numBytes];
        secureRandom.nextBytes(b);
        return bytesToHex(b);
    }

    static String hmacSha256Hex(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] digest = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(digest);
        } catch (Exception e) {
            return "";
        }
    }

    private static boolean constantTimeEqualsHex(String a, String b) {
        if (a == null || b == null || a.isEmpty() || a.length() != b.length()) return false;
        byte[] ba = a.toLowerCase(Locale.US).getBytes(StandardCharsets.US_ASCII);
        byte[] bb = b.toLowerCase(Locale.US).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(ba, bb);
    }

    private static String bytesToHex(byte[] bytes) {
        char[] hex = new char[bytes.length * 2];
        final char[] digits = "0123456789abcdef".toCharArray();
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xFF;
            hex[i * 2] = digits[v >>> 4];
            hex[i * 2 + 1] = digits[v & 0x0F];
        }
        return new String(hex);
    }

    private String safeMsg(Exception e) {
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }
}
