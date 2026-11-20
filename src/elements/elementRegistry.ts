export type ElementId =
  | 'fire'
  | 'water'
  | 'earth'
  | 'air'
  | 'lightning'
  | 'ice'
  | 'shadow'
  | 'lava';

export type WeaponType =
  | 'dual_katana'
  | 'liquid_staff'
  | 'great_hammer'
  | 'twin_sai'
  | 'nunchaku'
  | 'naginata'
  | 'shadow_sickles'
  | 'heavy_cleaver';

export type StatusEffectId =
  | 'burn'
  | 'chill'
  | 'shock'
  | 'soaked'
  | 'crush'
  | 'lift'
  | 'hex'
  | 'scorched';

export interface BendingArtSpec {
  id: string;
  name: string;
  mode: 'assault' | 'vortex' | 'arm_swing';
}

export interface ElementProfile {
  id: ElementId;
  name: string;
  fighterName: string;
  title: string;
  archetype: string;
  weaponName: string;
  weaponType: WeaponType;
  weaponReach: number;
  weaponSpeedMod: number; // <1 faster, >1 slower
  weaponDamageMod: number;
  moveSpeed: number;
  jumpForce: number;
  maxHp: number;
  primaryColor: number;
  glowColor: number;
  coreColor: number;
  cssPrimary: string;
  cssGlow: string;
  magicName: string;
  magicDescription: string;
  bendingArts: [BendingArtSpec, BendingArtSpec, BendingArtSpec];
  statusId: StatusEffectId;
  statusLabel: string;
  comebackName: string;
  comebackDescription: string;
  extraRollIFrames: number;
  wallJumpBonus: number;
  hasWakeUpArmor: boolean;
  hasEmberWakeUp: boolean;
  hasVoltDash: boolean;
  hasPermafrostParry: boolean;
  hasShadowStep: boolean;
  hasMoltenWake: boolean;
  crestSvg: string;
}

export const ELEMENT_REGISTRY: Record<ElementId, ElementProfile> = {
  fire: {
    id: 'fire',
    name: 'Fire',
    fighterName: 'IGNIS',
    title: 'Ashen Blade',
    archetype: 'Aggressive Rushdown',
    weaponName: 'Dual Katana',
    weaponType: 'dual_katana',
    weaponReach: 138,
    weaponSpeedMod: 0.92,
    weaponDamageMod: 1.06,
    moveSpeed: 5.5,
    jumpForce: 15.6,
    maxHp: 1000,
    primaryColor: 0xff5a14,
    glowColor: 0xffa629,
    coreColor: 0xfff0b8,
    cssPrimary: '#ff5a14',
    cssGlow: '#ffae34',
    magicName: "Sozin's Dragon",
    magicDescription: 'Launches twin dragon fire torrents, Phoenix Pillar vortex, or Flame Whip Slam.',
    bendingArts: [
      { id: 'fire_dragon', name: "SOZIN'S DRAGON", mode: 'assault' },
      { id: 'phoenix_vortex', name: 'PHOENIX PILLAR', mode: 'vortex' },
      { id: 'flame_whip', name: 'FLAME WHIP SLAM', mode: 'arm_swing' },
    ],
    statusId: 'burn',
    statusLabel: 'BURN',
    comebackName: 'Ember Wake-Up',
    comebackDescription: 'Wake-up sweep emits a scorching ember burst that pushes blockers back.',
    extraRollIFrames: 0,
    wallJumpBonus: 1.0,
    hasWakeUpArmor: false,
    hasEmberWakeUp: true,
    hasVoltDash: false,
    hasPermafrostParry: false,
    hasShadowStep: false,
    hasMoltenWake: false,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><path d="M33 6C35 16 25 22 25 32C25 37 28 40 32 40C36 40 39 36 39 31C39 28 38 25 37 22C45 27 49 35 48 43C46 53 39 58 32 58C22 58 15 51 15 41C15 28 24 20 33 6Z" fill="currentColor"/><path d="M32 34C30 39 27 42 27 47C27 51 29.5 54 32.5 54C36 54 38.5 51 38.5 47C38.5 42 35 38 32 34Z" fill="#fff3c4"/></svg>`,
  },
  water: {
    id: 'water',
    name: 'Water',
    fighterName: 'MIZU',
    title: 'Tidal Phantom',
    archetype: 'Fluid Counter-Striker',
    weaponName: 'Liquid Staff',
    weaponType: 'liquid_staff',
    weaponReach: 158,
    weaponSpeedMod: 0.96,
    weaponDamageMod: 0.98,
    moveSpeed: 5.35,
    jumpForce: 15.4,
    maxHp: 1020,
    primaryColor: 0x1698ff,
    glowColor: 0x52dcff,
    coreColor: 0xdffaff,
    cssPrimary: '#1698ff',
    cssGlow: '#52dcff',
    magicName: 'Tidal Tsunami',
    magicDescription: 'Commands Tidal Tsunami, lifting Water Tornado, and Water Arm Swing-Slam.',
    bendingArts: [
      { id: 'tsunami', name: 'TIDAL TSUNAMI', mode: 'assault' },
      { id: 'water_tornado', name: 'WATER TORNADO', mode: 'vortex' },
      { id: 'water_arm', name: 'WATER ARM SWING', mode: 'arm_swing' },
    ],
    statusId: 'soaked',
    statusLabel: 'SOAKED',
    comebackName: 'Liquid Slip',
    comebackDescription: '+6 extra invulnerability frames on all ground recovery rolls.',
    extraRollIFrames: 6,
    wallJumpBonus: 1.0,
    hasWakeUpArmor: false,
    hasEmberWakeUp: false,
    hasVoltDash: false,
    hasPermafrostParry: false,
    hasShadowStep: false,
    hasMoltenWake: false,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><path d="M32 8C32 8 15 27 15 40C15 49.4 22.6 57 32 57C41.4 57 49 49.4 49 40C49 27 32 8 32 8Z" fill="currentColor"/><path d="M23 41C24 46 28 50 34 50" stroke="#dffaff" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  earth: {
    id: 'earth',
    name: 'Earth',
    fighterName: 'TERRA',
    title: 'Iron Mountain',
    archetype: 'Heavy Bruiser',
    weaponName: 'Great Hammer',
    weaponType: 'great_hammer',
    weaponReach: 152,
    weaponSpeedMod: 1.18,
    weaponDamageMod: 1.24,
    moveSpeed: 4.55,
    jumpForce: 14.3,
    maxHp: 1140,
    primaryColor: 0xc9933b,
    glowColor: 0xf2c057,
    coreColor: 0xfff3cc,
    cssPrimary: '#c9933b',
    cssGlow: '#f2c057',
    magicName: 'Tectonic Fissure',
    magicDescription: 'Shatters the floor with Tectonic Fissures, Stone Cyclone, or Rock Gauntlet Slam.',
    bendingArts: [
      { id: 'earth_fissure', name: 'TECTONIC FISSURE', mode: 'assault' },
      { id: 'earth_vortex', name: 'STONE CYCLONE', mode: 'vortex' },
      { id: 'rock_arm', name: 'ROCK GAUNTLET SLAM', mode: 'arm_swing' },
    ],
    statusId: 'crush',
    statusLabel: 'CRUSH',
    comebackName: 'Earthen Poise',
    comebackDescription: 'Gains 1-hit super armor on wake-up attacks; immune to light stagger.',
    extraRollIFrames: 0,
    wallJumpBonus: 0.95,
    hasWakeUpArmor: true,
    hasEmberWakeUp: false,
    hasVoltDash: false,
    hasPermafrostParry: false,
    hasShadowStep: false,
    hasMoltenWake: false,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><polygon points="32,8 55,22 50,50 32,58 14,50 9,22" fill="currentColor"/><polyline points="20,44 30,26 37,37 44,24" stroke="#fff3cc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  air: {
    id: 'air',
    name: 'Air',
    fighterName: 'ZEPHYR',
    title: 'Gale Dancer',
    archetype: 'Aerial Acrobat',
    weaponName: 'Twin Sai',
    weaponType: 'twin_sai',
    weaponReach: 122,
    weaponSpeedMod: 0.82,
    weaponDamageMod: 0.94,
    moveSpeed: 6.1,
    jumpForce: 16.9,
    maxHp: 960,
    primaryColor: 0x3ed9a4,
    glowColor: 0x9cffd9,
    coreColor: 0xf2fffb,
    cssPrimary: '#3ed9a4',
    cssGlow: '#9cffd9',
    magicName: 'Tempest Hurricane',
    magicDescription: 'Unleashes Tempest Hurricane, Sky Cyclone juggle, or Gale Vacuum Throw.',
    bendingArts: [
      { id: 'air_hurricane', name: 'TEMPEST HURRICANE', mode: 'assault' },
      { id: 'air_tornado', name: 'SKY CYCLONE', mode: 'vortex' },
      { id: 'gale_whip', name: 'GALE VACUUM THROW', mode: 'arm_swing' },
    ],
    statusId: 'lift',
    statusLabel: 'GALE',
    comebackName: 'Zephyr Vault',
    comebackDescription: 'Wall jumps travel 35% higher and farther for effortless corner escapes.',
    extraRollIFrames: 2,
    wallJumpBonus: 1.35,
    hasWakeUpArmor: false,
    hasEmberWakeUp: false,
    hasVoltDash: false,
    hasPermafrostParry: false,
    hasShadowStep: false,
    hasMoltenWake: false,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><path d="M10 26H42C47 26 50 22 50 18C50 14 46 11 42 12C39 13 37 15 37 18" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M8 36H49C54 36 56 40 55 44C54 48 50 50 46 49C43 48 41 46 41 43" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M14 46H32" stroke="#f2fffb" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  lightning: {
    id: 'lightning',
    name: 'Lightning',
    fighterName: 'VOLT',
    title: 'Thunder Strike',
    archetype: 'Blitz Speedster',
    weaponName: 'Nunchaku',
    weaponType: 'nunchaku',
    weaponReach: 128,
    weaponSpeedMod: 0.80,
    weaponDamageMod: 0.97,
    moveSpeed: 6.25,
    jumpForce: 16.0,
    maxHp: 970,
    primaryColor: 0xf5c82e,
    glowColor: 0x82d0ff,
    coreColor: 0xffffff,
    cssPrimary: '#f5c82e',
    cssGlow: '#82d0ff',
    magicName: "Heaven's Thunder",
    magicDescription: "Calls down Heaven's Thunder, Plasma Cyclone, or Volt Tether Slam.",
    bendingArts: [
      { id: 'thunder_storm', name: "HEAVEN'S THUNDER", mode: 'assault' },
      { id: 'volt_vortex', name: 'PLASMA CYCLONE', mode: 'vortex' },
      { id: 'volt_whip', name: 'VOLT TETHER SLAM', mode: 'arm_swing' },
    ],
    statusId: 'shock',
    statusLabel: 'SHOCK',
    comebackName: 'Volt Dash',
    comebackDescription: 'Back handspring and forward dash gain brief blink speed with lightning trails.',
    extraRollIFrames: 0,
    wallJumpBonus: 1.05,
    hasWakeUpArmor: false,
    hasEmberWakeUp: false,
    hasVoltDash: true,
    hasPermafrostParry: false,
    hasShadowStep: false,
    hasMoltenWake: false,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><polygon points="36,6 14,35 30,35 25,58 50,27 34,27" fill="currentColor"/><polygon points="35,14 21,32 32,32 29,48 43,30 33,30" fill="#ffffff"/></svg>`,
  },
  ice: {
    id: 'ice',
    name: 'Ice',
    fighterName: 'FROST',
    title: 'Glacier Warden',
    archetype: 'Tempo Controller',
    weaponName: 'Frost Naginata',
    weaponType: 'naginata',
    weaponReach: 164,
    weaponSpeedMod: 1.0,
    weaponDamageMod: 1.03,
    moveSpeed: 5.1,
    jumpForce: 15.2,
    maxHp: 1030,
    primaryColor: 0x30d0f5,
    glowColor: 0x9cf4ff,
    coreColor: 0xffffff,
    cssPrimary: '#30d0f5',
    cssGlow: '#9cf4ff',
    magicName: 'Glacier Cataclysm',
    magicDescription: 'Fires Glacier Cataclysm, Blizzard Vortex, or Frost Spear Slam.',
    bendingArts: [
      { id: 'glacier', name: 'GLACIER CATACLYSM', mode: 'assault' },
      { id: 'blizzard_vortex', name: 'BLIZZARD VORTEX', mode: 'vortex' },
      { id: 'frost_grasp', name: 'FROST SPEAR SLAM', mode: 'arm_swing' },
    ],
    statusId: 'chill',
    statusLabel: 'FREEZE',
    comebackName: 'Permafrost Parry',
    comebackDescription: 'Perfect blocks freeze the attacker’s weapon recovery in solid frost.',
    extraRollIFrames: 0,
    wallJumpBonus: 1.0,
    hasWakeUpArmor: false,
    hasEmberWakeUp: false,
    hasVoltDash: false,
    hasPermafrostParry: true,
    hasShadowStep: false,
    hasMoltenWake: false,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><line x1="32" y1="7" x2="32" y2="57"/><line x1="10" y1="19" x2="54" y2="45"/><line x1="54" y1="19" x2="10" y2="45"/><polyline points="25,13 32,20 39,13"/><polyline points="25,51 32,44 39,51"/><polyline points="14,29 21,25 18,17"/><polyline points="50,35 43,39 46,47"/><polyline points="46,17 43,25 50,29"/><polyline points="18,47 21,39 14,35"/></g></svg>`,
  },
  shadow: {
    id: 'shadow',
    name: 'Shadow',
    fighterName: 'UMBRA',
    title: 'Eclipse Trickster',
    archetype: 'Illusionist Trickster',
    weaponName: 'Shadow Sickles',
    weaponType: 'shadow_sickles',
    weaponReach: 134,
    weaponSpeedMod: 0.88,
    weaponDamageMod: 1.02,
    moveSpeed: 5.8,
    jumpForce: 16.2,
    maxHp: 980,
    primaryColor: 0x7b6dff,
    glowColor: 0xc2b8ff,
    coreColor: 0xf4f0ff,
    cssPrimary: '#7b6dff',
    cssGlow: '#c2b8ff',
    magicName: 'Eclipse Tendrils',
    magicDescription: 'Summons Eclipse Tendrils, Abyssal Vortex, or Umbral Arm Grasp.',
    bendingArts: [
      { id: 'shadow_abyss', name: 'ECLIPSE TENDRILS', mode: 'assault' },
      { id: 'shadow_vortex', name: 'ABYSSAL VORTEX', mode: 'vortex' },
      { id: 'shadow_arm', name: 'UMBRAL ARM GRASP', mode: 'arm_swing' },
    ],
    statusId: 'hex',
    statusLabel: 'HEX',
    comebackName: 'Shadow Step',
    comebackDescription: 'Can cancel recovery rolls into a short phase-through teleport behind the opponent.',
    extraRollIFrames: 2,
    wallJumpBonus: 1.1,
    hasWakeUpArmor: false,
    hasEmberWakeUp: false,
    hasVoltDash: false,
    hasPermafrostParry: false,
    hasShadowStep: true,
    hasMoltenWake: false,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><path d="M42 12C30 14 21 24 21 36C21 47 29 55 41 56C26 58 12 47 12 33C12 19 25 8 42 12Z" fill="currentColor"/><circle cx="43" cy="27" r="4" fill="#f4f0ff"/></svg>`,
  },
  lava: {
    id: 'lava',
    name: 'Lava',
    fighterName: 'MAGMA',
    title: 'Caldera Tyrant',
    archetype: 'Area-Denial Juggernaut',
    weaponName: 'Heavy Cleaver',
    weaponType: 'heavy_cleaver',
    weaponReach: 150,
    weaponSpeedMod: 1.14,
    weaponDamageMod: 1.2,
    moveSpeed: 4.7,
    jumpForce: 14.5,
    maxHp: 1120,
    primaryColor: 0xff3214,
    glowColor: 0xff7b1a,
    coreColor: 0xffe478,
    cssPrimary: '#ff3214',
    cssGlow: '#ff7b1a',
    magicName: 'Caldera Eruption',
    magicDescription: 'Unleashes Caldera Eruption, Magma Cyclone, or Molten Chain Slam.',
    bendingArts: [
      { id: 'lava_eruption', name: 'CALDERA ERUPTION', mode: 'assault' },
      { id: 'lava_vortex', name: 'MAGMA CYCLONE', mode: 'vortex' },
      { id: 'lava_chain', name: 'MOLTEN CHAIN SLAM', mode: 'arm_swing' },
    ],
    statusId: 'scorched',
    statusLabel: 'SCORCHED',
    comebackName: 'Molten Wake',
    comebackDescription: 'Slams and wake-up attacks leave molten ground pools that deter rushdown.',
    extraRollIFrames: 0,
    wallJumpBonus: 0.95,
    hasWakeUpArmor: false,
    hasEmberWakeUp: false,
    hasVoltDash: false,
    hasPermafrostParry: false,
    hasShadowStep: false,
    hasMoltenWake: true,
    crestSvg: `<svg viewBox="0 0 64 64" fill="none"><path d="M12 52L24 24H40L52 52H12Z" fill="currentColor"/><path d="M24 24C24 16 28 11 32 8C36 12 40 16 40 24" stroke="#ffe478" stroke-width="4" stroke-linecap="round"/><path d="M28 24L32 40L36 24" fill="#ffe478"/></svg>`,
  },
};

export const ELEMENT_ORDER: ElementId[] = [
  'water',
  'fire',
  'ice',
  'earth',
  'air',
  'lightning',
  'shadow',
  'lava',
];
