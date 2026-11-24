package com.hosannaute.elementalshadows;

import android.app.Activity;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 100% offline Android LAN & Wi-Fi Hotspot 2-Player Duet transport.
 * Uses UDP LAN beacon + probe discovery and low-latency TCP_NODELAY sockets.
 */
public class WifiDuelManager {
    public static final int DISCOVERY_PORT = 42870;
    public static final int BASE_TCP_PORT = 42871;
    private static final String BEACON_PREFIX = "ES_DUEL|v1|";
    private static final String PROBE_TOKEN = "ES_PROBE|v1";

    private final Activity activity;
    private volatile WebView webView;
    private volatile boolean destroyed = false;

    private final AtomicInteger sessionSeq = new AtomicInteger(0);
    private final AtomicInteger scanSeq = new AtomicInteger(0);

    private volatile ServerSocket serverSocket;
    private volatile Socket peerSocket;
    private volatile DatagramSocket beaconSocket;
    private volatile DatagramSocket scanSocket;
    private volatile WifiManager.MulticastLock multicastLock;

    private volatile LinkedBlockingQueue<String> sendQueue;
    private volatile String hostName = "SHADOW";
    private volatile String hostEl = "water";
    private volatile int activeTcpPort = BASE_TCP_PORT;
    private volatile String activeRole = "";

    public WifiDuelManager(Activity activity) {
        this.activity = activity;
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
        return detectLocalIpv4();
    }

    @JavascriptInterface
    public void updateHostMeta(String name, String el) {
        this.hostName = sanitizeToken(name, "SHADOW");
        this.hostEl = sanitizeToken(el, "water");
    }

    @JavascriptInterface
    public void startHost(String name, String el) {
        final int sid = sessionSeq.incrementAndGet();
        scanSeq.incrementAndGet();
        closeSocketsQuietly();
        this.hostName = sanitizeToken(name, "SHADOW");
        this.hostEl = sanitizeToken(el, "water");
        this.activeRole = "host";

        Thread hostThread = new Thread(() -> runHostLoop(sid), "ES-WifiHost-" + sid);
        hostThread.setDaemon(true);
        hostThread.start();
    }

    @JavascriptInterface
    public void startScan() {
        final int scId = scanSeq.incrementAndGet();
        closeDatagramQuietly(scanSocket);
        scanSocket = null;

        Thread scanThread = new Thread(() -> runScanLoop(scId), "ES-WifiScan-" + scId);
        scanThread.setDaemon(true);
        scanThread.start();
    }

    @JavascriptInterface
    public void stopScan() {
        scanSeq.incrementAndGet();
        closeDatagramQuietly(scanSocket);
        scanSocket = null;
        if (!"host".equals(activeRole)) {
            releaseMulticastLock();
        }
    }

    @JavascriptInterface
    public void connectToHost(String rawTarget, int port) {
        final int sid = sessionSeq.incrementAndGet();
        scanSeq.incrementAndGet();
        closeSocketsQuietly();
        this.activeRole = "client";

        final String resolvedHost;
        final int resolvedPort;
        String cleaned = rawTarget == null ? "" : rawTarget.trim();
        int colonIdx = cleaned.lastIndexOf(':');
        if (colonIdx > 0 && colonIdx < cleaned.length() - 1) {
            int parsedPort = port > 0 ? port : BASE_TCP_PORT;
            try {
                parsedPort = Integer.parseInt(cleaned.substring(colonIdx + 1).trim());
            } catch (Exception ignored) { }
            resolvedPort = parsedPort;
            cleaned = cleaned.substring(0, colonIdx).trim();
        } else {
            resolvedPort = port > 0 ? port : BASE_TCP_PORT;
        }
        resolvedHost = expandRoomCode(cleaned);

        if (resolvedHost.isEmpty()) {
            emitEvent("error", "Enter a valid Dojo Room Code or IP address.", null);
            return;
        }

        Thread clientThread = new Thread(() -> runClientConnect(sid, resolvedHost, resolvedPort), "ES-WifiClient-" + sid);
        clientThread.setDaemon(true);
        clientThread.start();
    }

    @JavascriptInterface
    public void send(String jsonLine) {
        if (jsonLine == null || jsonLine.isEmpty()) return;
        LinkedBlockingQueue<String> q = this.sendQueue;
        if (q == null) return;
        // Never allow stale 30Hz state snapshots to build up latency behind inputs/events
        if (jsonLine.startsWith("{\"t\":\"st\"") && q.size() >= 6) {
            q.removeIf(item -> item.startsWith("{\"t\":\"st\""));
        }
        if (!q.offer(jsonLine)) {
            q.poll();
            q.offer(jsonLine);
        }
    }

    @JavascriptInterface
    public void disconnect() {
        sessionSeq.incrementAndGet();
        scanSeq.incrementAndGet();
        activeRole = "";
        closeSocketsQuietly();
        releaseMulticastLock();
    }

    public void destroy() {
        destroyed = true;
        disconnect();
        webView = null;
    }

    private void runHostLoop(int sid) {
        acquireMulticastLock();
        ServerSocket ss = null;
        int boundPort = BASE_TCP_PORT;
        for (int p = BASE_TCP_PORT; p < BASE_TCP_PORT + 10; p++) {
            try {
                ServerSocket candidate = new ServerSocket();
                candidate.setReuseAddress(true);
                candidate.bind(new InetSocketAddress(p));
                ss = candidate;
                boundPort = p;
                break;
            } catch (Exception ignored) { }
        }

        if (ss == null || sid != sessionSeq.get() || destroyed) {
            closeServerQuietly(ss);
            if (sid == sessionSeq.get() && !destroyed) {
                emitEvent("error", "Could not open local Wi-Fi server port.", null);
            }
            return;
        }

        serverSocket = ss;
        activeTcpPort = boundPort;
        String localIp = detectLocalIpv4();
        String shortCode = makeShortCode(localIp, boundPort);

        try {
            JSONObject extra = new JSONObject();
            extra.put("ip", localIp);
            extra.put("port", boundPort);
            extra.put("shortCode", shortCode);
            emitEvent("host_ready", "Waiting for Player 2 on Wi-Fi or Hotspot...", extra);
        } catch (Exception ignored) { }

        // Start UDP Discovery Beacon + Unicast Probe Responder
        final int tcpPort = boundPort;
        Thread beaconThread = new Thread(() -> runBeaconLoop(sid, tcpPort), "ES-WifiBeacon-" + sid);
        beaconThread.setDaemon(true);
        beaconThread.start();

        try {
            ss.setSoTimeout(1000);
            Socket accepted = null;
            while (sid == sessionSeq.get() && !destroyed && accepted == null) {
                try {
                    accepted = ss.accept();
                } catch (SocketTimeoutException ignored) { }
            }
            if (accepted == null || sid != sessionSeq.get() || destroyed) {
                closeSocketQuietly(accepted);
                return;
            }

            // Stop discovery beacon & server listener once Player 2 connects
            closeDatagramQuietly(beaconSocket);
            beaconSocket = null;
            closeServerQuietly(ss);
            serverSocket = null;

            configureRealtimeSocket(accepted);
            peerSocket = accepted;
            String peerIp = accepted.getInetAddress() != null ? accepted.getInetAddress().getHostAddress() : "";

            try {
                JSONObject extra = new JSONObject();
                extra.put("role", "host");
                extra.put("peerIp", peerIp);
                emitEvent("connected", "Challenger joined your Dojo!", extra);
            } catch (Exception ignored) { }

            runPeerSession(sid, accepted);
        } catch (Exception e) {
            if (sid == sessionSeq.get() && !destroyed) {
                emitEvent("error", "Host connection error: " + safeMsg(e), null);
            }
        } finally {
            closeServerQuietly(ss);
            if (sid == sessionSeq.get()) {
                releaseMulticastLock();
            }
        }
    }

    private void runBeaconLoop(int sid, int tcpPort) {
        DatagramSocket ds = null;
        try {
            ds = new DatagramSocket(null);
            ds.setReuseAddress(true);
            ds.setBroadcast(true);
            try {
                ds.bind(new InetSocketAddress(DISCOVERY_PORT));
            } catch (Exception bindErr) {
                // Fallback to ephemeral port if 42870 is busy; still broadcasts outbound beacons
                ds.bind(new InetSocketAddress(0));
            }
            ds.setSoTimeout(500);
            beaconSocket = ds;

            byte[] rxBuf = new byte[256];
            long lastBroadcast = 0;

            while (sid == sessionSeq.get() && peerSocket == null && !destroyed) {
                long now = System.currentTimeMillis();
                if (now - lastBroadcast >= 550) {
                    lastBroadcast = now;
                    String localIp = detectLocalIpv4();
                    byte[] payload = buildBeaconPayload(localIp, tcpPort);
                    for (InetAddress bcast : getBroadcastAddresses()) {
                        try {
                            ds.send(new DatagramPacket(payload, payload.length, bcast, DISCOVERY_PORT));
                        } catch (Exception ignored) { }
                    }
                }

                try {
                    DatagramPacket rx = new DatagramPacket(rxBuf, rxBuf.length);
                    ds.receive(rx);
                    String msg = new String(rx.getData(), 0, rx.getLength(), StandardCharsets.UTF_8).trim();
                    if (PROBE_TOKEN.equals(msg) && rx.getAddress() != null) {
                        String localIp = detectLocalIpv4();
                        byte[] reply = buildBeaconPayload(localIp, tcpPort);
                        ds.send(new DatagramPacket(reply, reply.length, rx.getAddress(), rx.getPort()));
                    }
                } catch (SocketTimeoutException ignored) {
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) {
        } finally {
            closeDatagramQuietly(ds);
            if (beaconSocket == ds) beaconSocket = null;
        }
    }

    private void runScanLoop(int scId) {
        acquireMulticastLock();
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
            scanSocket = ds;

            byte[] rxBuf = new byte[512];
            byte[] probeBytes = PROBE_TOKEN.getBytes(StandardCharsets.UTF_8);
            long lastProbe = 0;

            while (scId == scanSeq.get() && !destroyed) {
                long now = System.currentTimeMillis();
                if (now - lastProbe >= 900) {
                    lastProbe = now;
                    for (InetAddress bcast : getBroadcastAddresses()) {
                        try {
                            ds.send(new DatagramPacket(probeBytes, probeBytes.length, bcast, DISCOVERY_PORT));
                        } catch (Exception ignored) { }
                    }
                    // Also directly probe common Android Hotspot gateway IPs in case broadcast is filtered!
                    String gatewayIp = guessHotspotGateway();
                    if (gatewayIp != null && !gatewayIp.isEmpty()) {
                        try {
                            InetAddress gw = InetAddress.getByName(gatewayIp);
                            ds.send(new DatagramPacket(probeBytes, probeBytes.length, gw, DISCOVERY_PORT));
                        } catch (Exception ignored) { }
                    }
                }

                try {
                    DatagramPacket rx = new DatagramPacket(rxBuf, rxBuf.length);
                    ds.receive(rx);
                    String txt = new String(rx.getData(), 0, rx.getLength(), StandardCharsets.UTF_8).trim();
                    if (txt.startsWith(BEACON_PREFIX)) {
                        String[] parts = txt.split("\\|");
                        if (parts.length >= 6) {
                            String hName = parts[2];
                            String hEl = parts[3];
                            String hIp = "";
                            if (rx.getAddress() != null) {
                                String src = rx.getAddress().getHostAddress();
                                if (src != null && !src.isEmpty() && !"0.0.0.0".equals(src) && !src.startsWith("127.")) {
                                    hIp = src;
                                }
                            }
                            if (hIp.isEmpty()) {
                                hIp = parts[4];
                            }
                            int hPort = BASE_TCP_PORT;
                            try { hPort = Integer.parseInt(parts[5]); } catch (Exception ignored) { }
                            JSONObject extra = new JSONObject();
                            extra.put("name", hName);
                            extra.put("el", hEl);
                            extra.put("ip", hIp);
                            extra.put("port", hPort);
                            extra.put("shortCode", makeShortCode(hIp, hPort));
                            emitEvent("host_found", "", extra);
                        }
                    }
                } catch (SocketTimeoutException ignored) {
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) {
        } finally {
            closeDatagramQuietly(ds);
            if (scanSocket == ds) scanSocket = null;
        }
    }

    private void runClientConnect(int sid, String ip, int port) {
        Socket sock = null;
        try {
            sock = new Socket();
            sock.connect(new InetSocketAddress(ip, port), 4500);
            if (sid != sessionSeq.get() || destroyed) {
                closeSocketQuietly(sock);
                return;
            }
            configureRealtimeSocket(sock);
            peerSocket = sock;

            try {
                JSONObject extra = new JSONObject();
                extra.put("role", "client");
                extra.put("peerIp", ip);
                emitEvent("connected", "Connected to Host Dojo!", extra);
            } catch (Exception ignored) { }

            runPeerSession(sid, sock);
        } catch (Exception e) {
            closeSocketQuietly(sock);
            if (sid == sessionSeq.get() && !destroyed) {
                emitEvent("error", "Could not reach " + ip + ":" + port + " — check both phones share Wi-Fi or Hotspot.", null);
            }
        }
    }

    private void runPeerSession(int sid, Socket sock) {
        final LinkedBlockingQueue<String> queue = new LinkedBlockingQueue<>(64);
        this.sendQueue = queue;

        Thread writerThread = new Thread(() -> {
            try {
                BufferedWriter out = new BufferedWriter(new OutputStreamWriter(sock.getOutputStream(), StandardCharsets.UTF_8));
                while (sid == sessionSeq.get() && !destroyed && !sock.isClosed()) {
                    String line = queue.poll(400, TimeUnit.MILLISECONDS);
                    if (line == null) continue;
                    out.write(line);
                    out.write('\n');
                    // Batch flush any immediately available packets
                    while ((line = queue.poll()) != null) {
                        out.write(line);
                        out.write('\n');
                    }
                    out.flush();
                }
            } catch (Exception ignored) {
                closeSocketQuietly(sock);
            }
        }, "ES-WifiWriter-" + sid);
        writerThread.setDaemon(true);
        writerThread.start();

        try {
            BufferedReader in = new BufferedReader(new InputStreamReader(sock.getInputStream(), StandardCharsets.UTF_8));
            String line;
            while (sid == sessionSeq.get() && !destroyed && (line = in.readLine()) != null) {
                if (!line.isEmpty()) {
                    emitRawMessage(line);
                }
            }
        } catch (Exception ignored) {
        } finally {
            closeSocketQuietly(sock);
            if (this.sendQueue == queue) this.sendQueue = null;
            if (this.peerSocket == sock) this.peerSocket = null;
            if (sid == sessionSeq.get() && !destroyed) {
                emitEvent("disconnected", "Opponent disconnected.", null);
            }
        }
    }

    private void configureRealtimeSocket(Socket sock) {
        try { sock.setTcpNoDelay(true); } catch (Exception ignored) { }
        try { sock.setKeepAlive(true); } catch (Exception ignored) { }
        try { sock.setTrafficClass(0x10); } catch (Exception ignored) { } // IPTOS_LOWDELAY
        try { sock.setSoTimeout(0); } catch (Exception ignored) { }
    }

    private byte[] buildBeaconPayload(String localIp, int tcpPort) {
        String s = BEACON_PREFIX + sanitizeToken(hostName, "SHADOW") + "|" + sanitizeToken(hostEl, "water") + "|" + localIp + "|" + tcpPort;
        return s.getBytes(StandardCharsets.UTF_8);
    }

    private String sanitizeToken(String s, String fallback) {
        if (s == null) return fallback;
        String clean = s.replace("|", "").replace("\n", "").replace("\r", "").trim();
        if (clean.isEmpty()) return fallback;
        return clean.length() > 18 ? clean.substring(0, 18) : clean;
    }

    private String expandRoomCode(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        String[] parts = raw.split("\\.");
        if (parts.length == 4) return raw;
        if (parts.length == 2) {
            // Short code like "43.1" -> expand using own /16 prefix or 192.168
            String own = detectLocalIpv4();
            String[] ownParts = own.split("\\.");
            if (ownParts.length == 4 && ("192".equals(ownParts[0]) || "10".equals(ownParts[0]) || "172".equals(ownParts[0]))) {
                return ownParts[0] + "." + ownParts[1] + "." + parts[0] + "." + parts[1];
            }
            return "192.168." + parts[0] + "." + parts[1];
        }
        if (parts.length == 1 && raw.matches("\\d{1,3}")) {
            String own = detectLocalIpv4();
            String[] ownParts = own.split("\\.");
            if (ownParts.length == 4) {
                return ownParts[0] + "." + ownParts[1] + "." + ownParts[2] + "." + raw;
            }
            return "192.168.43." + raw;
        }
        return raw;
    }

    private String makeShortCode(String ip, int port) {
        if (ip == null) return "";
        String[] p = ip.split("\\.");
        if (p.length == 4 && "192".equals(p[0]) && "168".equals(p[1]) && port == BASE_TCP_PORT) {
            return p[2] + "." + p[3];
        }
        return port == BASE_TCP_PORT ? ip : (ip + ":" + port);
    }

    private String guessHotspotGateway() {
        String own = detectLocalIpv4();
        String[] p = own.split("\\.");
        if (p.length == 4 && ("192".equals(p[0]) || "10".equals(p[0]) || "172".equals(p[0]))) {
            // Android Hotspots almost always assign host as .1 (or Samsung .43.1 / .137.1)
            return p[0] + "." + p[1] + "." + p[2] + ".1";
        }
        return "192.168.43.1";
    }

    private String detectLocalIpv4() {
        String hotspotIp = "";
        String wifiIp = "";
        String fallback = "";
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            if (nis == null) return "192.168.43.1";
            List<NetworkInterface> list = Collections.list(nis);
            for (NetworkInterface ni : list) {
                if (ni == null || ni.isLoopback() || !ni.isUp()) continue;
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("tun") || name.startsWith("dummy")) continue;
                boolean isHotspot = name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("softap")
                        || name.equals("wlan1") || name.equals("wlan2") || name.startsWith("tether");
                boolean isWifi = name.startsWith("wlan") || name.startsWith("p2p") || name.startsWith("eth");
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        String host = a.getHostAddress();
                        if (host == null || host.startsWith("127.")) continue;
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
                    String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                    if (name.startsWith("rmnet") || name.startsWith("tun") || name.startsWith("dummy")) continue;
                    for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                        InetAddress b = ia.getBroadcast();
                        if (b instanceof Inet4Address) set.add(b);
                    }
                }
            }
        } catch (Exception ignored) { }
        try {
            set.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) { }
        return new ArrayList<>(set);
    }

    private void acquireMulticastLock() {
        try {
            if (multicastLock != null && multicastLock.isHeld()) return;
            WifiManager wm = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                WifiManager.MulticastLock lock = wm.createMulticastLock("ElementalShadowsDuel");
                lock.setReferenceCounted(false);
                lock.acquire();
                multicastLock = lock;
            }
        } catch (Throwable ignored) { }
    }

    private void releaseMulticastLock() {
        try {
            WifiManager.MulticastLock lock = multicastLock;
            multicastLock = null;
            if (lock != null && lock.isHeld()) lock.release();
        } catch (Throwable ignored) { }
    }

    private void emitEvent(String type, String message, JSONObject extra) {
        try {
            JSONObject obj = extra != null ? extra : new JSONObject();
            obj.put("type", type);
            if (message != null && !message.isEmpty()) obj.put("message", message);
            final String quoted = JSONObject.quote(obj.toString());
            dispatchJs("window.__onWifiDuelEvent && window.__onWifiDuelEvent(JSON.parse(" + quoted + "))");
        } catch (Exception ignored) { }
    }

    private void emitRawMessage(String jsonLine) {
        final String quoted = JSONObject.quote(jsonLine);
        dispatchJs("window.__onWifiDuelMsg && window.__onWifiDuelMsg(" + quoted + ")");
    }

    private void dispatchJs(String js) {
        if (destroyed) return;
        activity.runOnUiThread(() -> {
            WebView wv = webView;
            if (wv != null && !destroyed) {
                try {
                    wv.evaluateJavascript(js, null);
                } catch (Throwable ignored) { }
            }
        });
    }

    private void closeSocketsQuietly() {
        closeSocketQuietly(peerSocket);
        peerSocket = null;
        closeServerQuietly(serverSocket);
        serverSocket = null;
        closeDatagramQuietly(beaconSocket);
        beaconSocket = null;
        closeDatagramQuietly(scanSocket);
        scanSocket = null;
        sendQueue = null;
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

    private String safeMsg(Exception e) {
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }
}
