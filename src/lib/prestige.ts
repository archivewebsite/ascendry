export interface PrestigePerk {
  key: string;
  name: string;
  icon: string;
  description: string;
  effect: string;
  maxLevel: number;
  calculationRelevant: boolean;
}

export const PRESTIGE_PERKS: PrestigePerk[] = [
  { key: "pyrology", name: "Pyrology", icon: "🔥", description: "Get more items back when using Burn.", effect: "+0.5% return per level", maxLevel: 50, calculationRelevant: false },
  { key: "nepotism", name: "Nepotism", icon: "🤝", description: "Spend less BC when ranking up.", effect: "−2.5% rank cost per level", maxLevel: 20, calculationRelevant: false },
  { key: "anointment", name: "Anointment", icon: "♐", description: "Spend less BC when ascending.", effect: "−2.5% ascension cost per level", maxLevel: 20, calculationRelevant: false },
  { key: "fortuity", name: "Fortuity", icon: "🍀", description: "Raise the base multiplier for finding Rare Items.", effect: "2× discovery multiplier per level", maxLevel: 29, calculationRelevant: false },
  { key: "favoritism", name: "Favoritism", icon: "😇", description: "Increase the chance of receiving a Work Bonus.", effect: "+15% chance per level", maxLevel: 13, calculationRelevant: false },
  { key: "asterism", name: "Asterism", icon: "♉", description: "Raise the highest tier a Pet can reach through reincarnation.", effect: "Up to Tier VI by level", maxLevel: 15, calculationRelevant: false },
  { key: "deluge", name: "Deluge", icon: "☔", description: "Water your Farm again sooner.", effect: "−25 minutes cooldown per level", maxLevel: 4, calculationRelevant: false },
  { key: "arbory", name: "Arbory", icon: "🎋", description: "Plant more of the same crop at one time.", effect: "+4 planted per level", maxLevel: 37, calculationRelevant: false },
  { key: "menager", name: "Menager", icon: "🎪", description: "Store more Pets and Eggs. Adventure slots are unchanged.", effect: "+10 Pet and Egg space per level", maxLevel: 200, calculationRelevant: false },
  { key: "playboy", name: "Playboy", icon: "😘", description: "Switch your active Buddy sooner.", effect: "−45 minutes cooldown per level", maxLevel: 3, calculationRelevant: false },
  { key: "numismatist", name: "Numismatist", icon: "🪙", description: "Raise the maximum BC allowed in one Coinflip.", effect: "+1B BC limit per level", maxLevel: 19, calculationRelevant: false },
  { key: "hammerspace", name: "Hammerspace", icon: "🔨", description: "Equip more items at the same time.", effect: "+2 items per level", maxLevel: 74, calculationRelevant: false },
  { key: "hypervisor", name: "Hypervisor", icon: "🤖", description: "Keep the Relay Network running longer before it becomes idle.", effect: "+16 hours idle time per level", maxLevel: 21, calculationRelevant: false },
  { key: "vitality", name: "Vitality", icon: "🌼", description: "Keep your Farm productive longer between waterings.", effect: "+16 hours per level", maxLevel: 21, calculationRelevant: false },
  { key: "gourmand", name: "Gourmand", icon: "🧑‍🍳", description: "Gain a larger XP multiplier by satisfying a Pet’s craving.", effect: "+6× XP per level", maxLevel: 25, calculationRelevant: false },
  { key: "amnesiac", name: "Amnesiac", icon: "😵‍💫", description: "Increase the chance that an action ignores its cooldown.", effect: "+1% chance per level", maxLevel: 20, calculationRelevant: false },
  { key: "fecality", name: "Fecality", icon: "🤢", description: "Receive more Manure when feeding a Pet.", effect: "+15% output per level", maxLevel: 5, calculationRelevant: false },
  { key: "fecundity", name: "Fecundity", icon: "🫒", description: "Receive more rare-crop output from your Farm.", effect: "+15% output per level", maxLevel: 5, calculationRelevant: false },
  { key: "virility", name: "Virility", icon: "🌶️", description: "Reduce the wait before you can breed a Pet again.", effect: "−1 day cooldown per level", maxLevel: 100, calculationRelevant: false },
  { key: "gluttony", name: "Gluttony", icon: "🤤", description: "Increase how much Energy a Pet can hold.", effect: "+5% capacity per level", maxLevel: 10, calculationRelevant: false },
  { key: "zootechny", name: "Zootechny", icon: "🧬", description: "Reduce the cost of breeding Pets.", effect: "−5% cost per level", maxLevel: 19, calculationRelevant: false },
  { key: "lapidist", name: "Lapidist", icon: "💎", description: "Add more augmentation slots to Tools.", effect: "+1 slot per level", maxLevel: 4, calculationRelevant: false },
  { key: "overgrowth", name: "Overgrowth", icon: "🌾", description: "Receive more byproducts when watering your Farm.", effect: "+25% byproducts per level", maxLevel: 20, calculationRelevant: false },
  { key: "mercantilist", name: "Mercantilist", icon: "💹", description: "Unlock more items that you can sell on the normal Market.", effect: "+3 normal-Market items per level", maxLevel: 61, calculationRelevant: true },
  { key: "loyalist", name: "Loyalist", icon: "🙏", description: "Raise the maximum quantity of each item available from Daily rewards.", effect: "+1 maximum per level", maxLevel: 25, calculationRelevant: false },
  { key: "insider", name: "Insider", icon: "🕶️", description: "Pay a lower transaction fee when selling on the Market.", effect: "−0.5 percentage points per level; 2.5% floor", maxLevel: 45, calculationRelevant: true },
  { key: "provenance", name: "Provenance", icon: "🏛️", description: "Unlock higher Museum collection reward tiers.", effect: "+1 Tier-2 reward per level", maxLevel: 19, calculationRelevant: false },
  { key: "quartermaster", name: "Quartermaster", icon: "📦", description: "Gain more Supply Depot rerolls each day.", effect: "+2 rerolls per day per level", maxLevel: 4, calculationRelevant: false },
];

export const TOTAL_MAX_PRESTIGE_LEVELS = PRESTIGE_PERKS.reduce((sum, perk) => sum + perk.maxLevel, 0);

const MARKET_UNLOCKS: string[][] = [
  ["Seaweed", "Coal", "Feathers"],
  ["Sardine", "Rock", "Weeds"],
  ["Copper", "Old Bones", "Tattered Boot"],
  ["Discarded Butt", "Chestnut", "Prawn"],
  ["Exotic Bean", "Aluminum", "Red Mushroom"],
  ["Rusty Knife", "Clover", "Scrap Metal"],
  ["Iron", "Bird Nest", "Big Log"],
  ["Jellyfish", "Neodymium", "Silver"],
  ["Milk", "Skunk Pelt", "Antique Bottle"],
  ["Soybean", "Quartz", "Prime Steak"],
  ["Blueberry", "Badger Pelt", "Ocean Crab"],
  ["Rich Wool", "Gold", "Ox Pelt"],
  ["Chunky Coral", "Russet Potato", "Golden Wheat"],
  ["Floppy Disk", "Basic Capacitor", "Lightbulb"],
  ["Chisel", "Thermite", "Lithium"],
  ["Blowfish", "Thick Rope", "Bricks"],
  ["Insulating Resin", "Petroleum", "Electric Eel"],
  ["Aluminum Pipe", "Strawberry", "Rubber Tire"],
  ["Circuit Shard", "Insulated Wire", "Basic Processor"],
  ["Frostsac", "Buffalo Pelt", "Clamshell"],
  ["Bomb", "Ritual Urn", "Hard Drive"],
  ["Conductive Algae", "Kiwi", "Light Suede"],
  ["Manure", "Titanium Ore", "Silicon Dust"],
  ["Steel Beam", "Reinforced Chain", "Seafood Salad"],
  ["Mango", "Great White", "Wooden Hull"],
  ["Glass Pane", "Hearty Burger", "Raw Plastic"],
  ["Treated Hull", "Melon", "Cobalt"],
  ["Elk Antlers", "Ornate Necklace", "Diamond"],
  ["Ancient Fossil", "Nautical Compass", "Painted Totem"],
  ["Warm Broth", "Basic Motor", "Pearled Oyster"],
  ["Tough Rawhide", "Sonar Dish", "Broadsword"],
  ["Fancy Crate", "Charged Battery", "Cinder Fragment"],
  ["Cavern Bounty", "Hillside Bounty", "Forest Bounty"],
  ["Ocean Bounty", "Old Crown", "Heavy Insulation"],
  ["Solar Panel", "Stone Soup", "Poison Spear"],
  ["Grand Hall", "Industrial Rotor", "Uranium"],
  ["Platinum", "Treasure Chest", "Manuscript"],
  ["Fish Finder", "Reinforced Hull", "Downy Parka"],
  ["Sharktooth Necklace", "Dowsing Rod", "Signal Matrix"],
  ["Cryo Gel", "Diamond Tether", "Coconut"],
  ["Giant Squid", "Stun Gun", "Industrial Alternator"],
  ["Reinforced Frame", "Ashen Relic", "Fragrant Dogrose"],
  ["Advanced Processor", "Survival Kit", "Mecha Canary"],
  ["Scout Submarine", "Relay Frame", "Knife Turret"],
  ["Pumpkin", "Imbued Sword", "Rainmaking Amulet"],
  ["Exquisite Trunk", "Neptune's Trident", "Lucky Charm"],
  ["Mysterious Sludge", "DX Coolant", "Eternal Snowflake"],
  ["Phoenix Ash", "Mystical Rowan", "Sinurator"],
  ["Enriching Fertilizer", "Alien Technology", "Evil Tome"],
  ["Nuclear Reactor", "Lunar Shard", "Crystal Sword"],
  ["Experimental Fertilizer", "Mutagenic Sludge", "Cursed Charm"],
  ["Massive Driftnet", "Orbital Mining Laser", "Pocket Rocket"],
  ["Charred Crown", "Mystical Balls", "Legendary Aguaje"],
  ["Green Gemerald", "Sialogogue", "Tiny Gem Bag"],
  ["Amber Gemerald", "Condemned Skull", "Seraphic Clasp"],
  ["Untamed Spirit", "Magic Conch", "Pluperfect Gemerald"],
  ["Purple Gemerald", "Forbidden Knowledge", "Small Gem Bag"],
  ["Auspicious Coin", "Gilded Manure", "Red Gemerald"],
  ["Obscure Sigil", "Magic Token", "Bconomy Sourcecode"],
  ["Little Brother", "Gem Bag", "Damned Intent"],
  ["Subterran Crest", "Daoic Seal", "Hunter's Blind"],
  ["Hunter's Blind", "Atlantic Obol", "Low Orbit Ion Cannon"],
];

export const MERCANTILIST_UNLOCKS = MARKET_UNLOCKS.map((items, level) => ({ level, items }));

const requiredLevelByName = new Map<string, number>();
for (const row of MERCANTILIST_UNLOCKS) {
  for (const name of row.items) {
    const current = requiredLevelByName.get(name);
    if (current === undefined || row.level < current) requiredLevelByName.set(name, row.level);
  }
}

export function requiredMercantilistLevel(itemName: string): number | null {
  return requiredLevelByName.get(itemName) ?? null;
}

export function validatePrestigeLevels(levels: Record<string, number>) {
  for (const perk of PRESTIGE_PERKS) {
    const level = levels[perk.key] ?? 0;
    if (!Number.isInteger(level) || level < 0 || level > perk.maxLevel) {
      throw new Error(`${perk.name} must be a whole level from 0 to ${perk.maxLevel}.`);
    }
  }
}
