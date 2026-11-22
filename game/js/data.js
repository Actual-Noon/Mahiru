"use strict";
// รายชื่อมอนสเตอร์ทุกตัวที่ไฟล์ของนักเรียนส่งเข้ามา (เติมโดย registerMonsters)
window.MONSTERS = [];

// ForgeData เก็บกติกาทั้งหมดของเกม: สเตตัส ธาตุ บัพทีม สกิล และการตรวจข้อมูล
window.ForgeData = (function () {
  // ---------- ตัวเลขสมดุลของเกม (ปรับที่นี่ที่เดียว ระบบต่อสู้และคำอธิบายจะเปลี่ยนตาม) ----------
  const rules = {
    budget: 100,                  // แต้มสเตตัสรวมสูงสุดต่อมอนสเตอร์ 1 ตัว
    hpBase: 110,                  // HP พื้นฐานของทุกตัว
    hpPerPoint: 3.25,             // HP ที่เพิ่มต่อแต้ม hp 1 แต้ม
    damageBase: 22,               // ดาเมจพื้นฐานก่อนคิด attack
    damagePerAttack: 0.52,        // ดาเมจที่เพิ่มต่อแต้ม attack 1 แต้ม
    defenseScale: 42,             // ยิ่งค่านี้น้อย defense ยิ่งลดดาเมจได้มาก (ตัวคูณ = 42 / (42 + DEF))
    defenseFloor: 20,             // DEF ถูกลดจนติดลบได้ต่ำสุด -20 (DEF ติดลบ = โดนแรงขึ้น)
    advantage: 1.25,              // ตัวคูณดาเมจเมื่อโจมตีธาตุที่เราชนะ
    disadvantage: 0.75,           // ตัวคูณดาเมจเมื่อโจมตีธาตุที่เราแพ้
    speedDodge: 0.2,              // speed 1 แต้ม เพิ่มโอกาสหลบกี่ %
    speedDouble: 0.45,            // speed 1 แต้ม เพิ่มโอกาสโจมตีซ้ำในเทิร์นเดียวกันกี่ %
    evasionPerPoint: 1.25,        // หลบหลีก 1 แต้ม เพิ่มโอกาสหลบกี่ %
    dodgeCap: 45,                 // โอกาสหลบรวมสูงสุด %
    critPerPoint: 1.4,            // คริติคอล 1 แต้ม เพิ่มโอกาสคริกี่ %
    critPower: 2,                 // ตัวคูณดาเมจคริติคอล
    lifestealPerPoint: 1.85,      // ดูดเลือด 1 แต้ม ฟื้น HP กี่ % ของดาเมจที่ทำได้
    piercePerPoint: 3,            // เจาะเกราะ 1 แต้ม มองข้าม DEF ศัตรูกี่ %
    pierceBonus: 0.006,           // เจาะเกราะ 1 แต้ม เพิ่มดาเมจกี่ส่วน (30 แต้ม = แรงขึ้น 18%)
    fatigueStart: 60,             // หลังเทิร์นที่ 60 เริ่มเหนื่อยล้า ทุกการโจมตีแรงขึ้นเรื่อย ๆ กันเกมยืดเยื้อ
    fatigueStep: 0.05,            // ดาเมจที่เพิ่มต่อเทิร์นหลังเริ่มเหนื่อยล้า
    skillEvery: 3,                // สกิลทำงานทุกกี่เทิร์นของตัวเอง
    strikePower: 1.95,            // ตัวคูณดาเมจของสกิลโจมตีหนัก
    critStrikePower: 1.25,        // ตัวคูณดาเมจของสกิลโจมตีจุดตาย
    critStrikeChance: 50,         // สกิลโจมตีจุดตาย: โอกาสคริเพิ่มกี่ %
    poisonPower: 1,               // ตัวคูณดาเมจของสกิลพิษตอนโจมตี
    poisonRate: 0.06,             // พิษลด HP ต่อเทิร์น (สัดส่วนของ HP สูงสุด)
    poisonTurns: 3,               // พิษอยู่กี่เทิร์นของเป้าหมาย
    healRate: 0.16,               // สกิลฟื้นพลังฟื้น HP (สัดส่วนของ HP สูงสุด)
    shieldRate: 0.12,             // สกิลสร้างโล่ได้โล่ (สัดส่วนของ HP สูงสุด)
    shieldCap: 0.25,              // โล่สะสมได้สูงสุด (สัดส่วนของ HP สูงสุด)
    noneBonus: 0.05,              // ไม่มีติดตัว: HP และดาเมจเพิ่มกี่ส่วน
    thornsRate: 0.15,             // หนามสะท้อนดาเมจกลับ (สัดส่วนของดาเมจที่โดน)
    regenRate: 0.02,              // ฟื้นตัวต้นเทิร์น (สัดส่วนของ HP สูงสุด)
    berserkPower: 1.25,           // ตัวคูณดาเมจของฮึดสู้
    hardCritBonus: 0.75,          // ติดตัวคริรุนแรง: ตัวคูณคริติคอลเพิ่มอีกเท่านี้
    berserkAt: 0.35,              // ฮึดสู้ทำงานเมื่อ HP เหลือไม่เกินสัดส่วนนี้
    buffScale: [0, 3.5, 1.4, 1],  // ความแรงบัพตามจำนวนบัพในทีม: 1 บัพ ×3.5 / 2 บัพ ×1.4 / 3 บัพ ×1
    waterOncePerTeam: false,      // true = บัพน้ำกันตายได้ครั้งเดียวทั้งทีม, false = ครั้งเดียวต่อตัว
    windPower: 0.12,              // บัพลม: ดาเมจแรงขึ้น
    rockShield: 0.15,             // บัพหิน: ได้โล่เท่ากับสัดส่วนนี้ของดาเมจที่ทำได้
    lightningDefense: 3,          // บัพสายฟ้า: ลด DEF ศัตรูต่อการโจมตีที่โดน
    lightningMax: 12,             // บัพสายฟ้า: ลด DEF ได้รวมสูงสุด
    plantHeal: 0.18,              // บัพพืช: ฟื้น HP เท่ากับสัดส่วนนี้ของดาเมจที่ทำได้
    waterRevive: 0.1,             // บัพน้ำ: รอดตายแล้วฟื้นเป็นสัดส่วนนี้ของ HP สูงสุด
    fireExtra: 0.12,              // บัพไฟ: เผาซ้ำอีกครั้งเท่ากับสัดส่วนนี้ของการโจมตีเดิม
    iceSpeed: 4,                  // บัพน้ำแข็ง: ลด SPD ศัตรูต่อการโจมตีที่โดน
    iceMax: 16,                   // บัพน้ำแข็ง: ลด SPD ได้รวมสูงสุด
    iceMiss: 0.6,                 // บัพน้ำแข็ง: ศัตรูที่ถูกลด SPD ตีพลาดเพิ่มกี่ % ต่อ SPD ที่ถูกลด 1 แต้ม
    maxTurns: 300                 // จำนวนเทิร์นสูงสุด ถ้าครบ ฝั่งที่เหลือตัว/HP มากกว่าชนะ
  };
  const pct = function (value) { return Math.round(value * 100) + "%"; };   // แปลงสัดส่วนเป็นข้อความ %

  // ---------- สเตตัส ----------
  const budget = rules.budget;
  const limits = { hp: 50, attack: 40, defense: 40, speed: 40, critical: 25, lifesteal: 20, evasion: 20, armorPierce: 30 };   // เพดานรายค่า
  const labels = { hp: "HP", attack: "ATK", defense: "DEF", speed: "SPD", critical: "คริติคอล", lifesteal: "ดูดเลือด", evasion: "หลบหลีก", armorPierce: "เจาะเกราะ" };
  const statKeys = Object.keys(limits);
  const descriptions = {
    hp: "HP สูงสุด = " + rules.hpBase + " + HP × " + rules.hpPerPoint,
    attack: "เพิ่มความเสียหายพื้นฐาน",
    defense: "ลดความเสียหายที่ได้รับ",
    speed: "ได้ตีก่อนเมื่อลงสนาม หลบ +" + rules.speedDodge + "% และโอกาสตีซ้ำ +" + rules.speedDouble + "% ต่อแต้ม",
    critical: "โอกาสคริ +" + rules.critPerPoint + "% ต่อแต้ม แรง " + rules.critPower + " เท่า",
    lifesteal: "ฟื้น HP " + rules.lifestealPerPoint + "% ของดาเมจที่ทำได้ ต่อแต้ม",
    evasion: "หลบ +" + rules.evasionPerPoint + "% ต่อแต้ม (รวมทั้งหมดไม่เกิน " + rules.dodgeCap + "%)",
    armorPierce: "มองข้าม DEF ศัตรู " + rules.piercePerPoint + "% และแรงขึ้น " + (rules.pierceBonus * 100) + "% ต่อแต้ม"
  };

  // ---------- สกิลและติดตัว ----------
  const skills = {
    strike: { name: "โจมตีหนัก", description: "โจมตีแรง " + rules.strikePower + " เท่า" },
    critStrike: { name: "โจมตีจุดตาย", description: "โจมตีแรง " + rules.critStrikePower + " เท่า และโอกาสคริติคอล +" + rules.critStrikeChance + "%" },
    poison: { name: "พิษ", description: "โจมตี " + rules.poisonPower + " เท่า ติดพิษ " + rules.poisonTurns + " เทิร์น เทิร์นละ " + pct(rules.poisonRate) + " HP สูงสุด" },
    heal: { name: "ฟื้นพลัง", description: "ฟื้น " + pct(rules.healRate) + " HP สูงสุด แล้วโจมตีต่อ" },
    shield: { name: "สร้างโล่", description: "สร้างโล่ " + pct(rules.shieldRate) + " HP สูงสุด แล้วโจมตีต่อ (สะสมไม่เกิน " + pct(rules.shieldCap) + ")" }
  };
  const traits = {
    none: { name: "ไม่มีติดตัว", description: "ร่างกายแข็งแรง: HP และดาเมจ +" + pct(rules.noneBonus) },
    thorns: { name: "หนามสะท้อน", description: "สะท้อน " + pct(rules.thornsRate) + " ของดาเมจที่โดนกลับไป" },
    regeneration: { name: "ฟื้นตัว", description: "ฟื้น " + pct(rules.regenRate) + " HP สูงสุดทุกต้นเทิร์นของตัวเอง" },
    hardCrit: { name: "คริรุนแรง", description: "คริติคอลแรงขึ้นจาก " + rules.critPower + " เป็น " + (rules.critPower + rules.hardCritBonus) + " เท่า" },
    berserk: { name: "ฮึดสู้", description: "แรงขึ้น " + pct(rules.berserkPower - 1) + " เมื่อ HP เหลือไม่เกิน " + pct(rules.berserkAt) }
  };

  // ---------- ธาตุ ----------
  // beats = ธาตุที่ธาตุนี้ชนะ (ลม <- หิน <- พืช <- ไฟ <- น้ำ <- น้ำแข็ง <- สายฟ้า <- ลม)
  const elements = {
    wind:      { name: "ลม",      color: "#9be07a", ink: "#173d0b", beats: "lightning", buff: "ทุกการโจมตีแรงขึ้น " + pct(rules.windPower) },
    rock:      { name: "หิน",     color: "#c0703a", ink: "#ffffff", beats: "wind",      buff: "ทุกการโจมตีได้โล่ " + pct(rules.rockShield) + " ของดาเมจที่ทำได้" },
    plant:     { name: "พืช",     color: "#2e7d32", ink: "#ffffff", beats: "rock",      buff: "ทุกการโจมตีฟื้น HP " + pct(rules.plantHeal) + " ของดาเมจที่ทำได้" },
    fire:      { name: "ไฟ",      color: "#d84315", ink: "#ffffff", beats: "plant",     buff: "ทุกการโจมตีเผาซ้ำอีก " + pct(rules.fireExtra) + " ของดาเมจเดิม" },
    water:     { name: "น้ำ",     color: "#1e6fd9", ink: "#ffffff", beats: "fire",      buff: "รอดตาย 1 ครั้งต่อตัว แล้วฟื้น " + pct(rules.waterRevive) + " HP สูงสุด" },
    ice:       { name: "น้ำแข็ง", color: "#8fd8f5", ink: "#0b3a52", beats: "water",     buff: "ตีโดนแล้วลด SPD ศัตรู " + rules.iceSpeed + " (สูงสุด " + rules.iceMax + ") ทำให้ศัตรูตีพลาดง่ายขึ้น" },
    lightning: { name: "สายฟ้า",  color: "#8e44ec", ink: "#ffffff", beats: "ice",       buff: "ตีโดนแล้วลด DEF ศัตรู " + rules.lightningDefense + " (สูงสุด " + rules.lightningMax + ") ติดลบได้ = โดนแรงขึ้น" }
  };
  const elementAliases = { "ลม": "wind", "หิน": "rock", "พืช": "plant", "ไฟ": "fire", "น้ำ": "water", "น้ำแข็ง": "ice", "สายฟ้า": "lightning", "ไฟฟ้า": "lightning" };   // รับชื่อไทยได้ด้วย
  const has = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };

  // แปลงค่า element ที่นักเรียนเขียน (อังกฤษหรือไทย) เป็นชื่อธาตุมาตรฐาน คืน null ถ้าไม่รู้จัก
  function elementKey(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (has(elements, text.toLowerCase())) return text.toLowerCase();
    return has(elementAliases, text) ? elementAliases[text] : null;
  }

  // ตัวคูณดาเมจระหว่างธาตุผู้โจมตีกับธาตุเป้าหมาย: ชนะ 1.25 / แพ้ 0.75 / ปกติ 1
  function matchup(attacker, defender) {
    if (elements[attacker].beats === defender) return rules.advantage;
    if (elements[defender].beats === attacker) return rules.disadvantage;
    return 1;
  }

  // คำนวณบัพทีมจากธาตุของสมาชิกทั้ง 3 ตัว: 1 ธาตุไม่ซ้ำ = 1 บัพ (เช่น 3 ธาตุไม่ซ้ำ = 3 บัพ)
  // ธาตุในทีมเดียวกันไม่ข่มกัน การแพ้/ชนะธาตุมีผลเฉพาะกับมอนสเตอร์ของทีมตรงข้ามที่กำลังสู้อยู่
  function teamBuffs(list) {
    const distinct = list.filter(function (key, index) { return list.indexOf(key) === index; });
    return { active: distinct, suppressed: [] };
  }

  // ---------- ตรวจข้อมูลมอนสเตอร์ 1 ตัว (ไม่แก้ข้อมูลต้นฉบับ) ----------
  function validate(monster, registry) {
    const errors = [];
    const warnings = [];
    const source = monster && monster.stats;
    const stats = {};
    let rawTotal = 0;
    let canTotal = true;
    if (!monster || typeof monster.id !== "string" || !monster.id.trim()) errors.push("ต้องมี id");
    if (monster && (registry || []).filter(function (entry) { return entry && entry.id === monster.id; }).length > 1) errors.push("id ซ้ำกับมอนสเตอร์ตัวอื่น");
    if (!monster || typeof monster.name !== "string" || !monster.name.trim()) errors.push("ต้องใส่ชื่อ (name)");
    statKeys.forEach(function (key) {
      const value = source ? source[key] : undefined;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(labels[key] + " ต้องเป็นตัวเลข");
        canTotal = false;
        stats[key] = 0;
        return;
      }
      rawTotal += value;
      stats[key] = Math.max(0, Math.min(limits[key], Math.floor(value)));
      if (stats[key] !== value) warnings.push(labels[key] + ": " + value + " → " + stats[key] + " (เพดาน " + limits[key] + ")");
    });
    let total = statKeys.reduce(function (sum, key) { return sum + stats[key]; }, 0);
    if (total > budget) {
      // ลดทุกค่าตามสัดส่วน แล้วแจกเศษให้ครบ 100 พอดี
      const shares = statKeys.map(function (key) { const scaled = stats[key] * budget / total; return { key: key, value: Math.floor(scaled), fraction: scaled - Math.floor(scaled) }; });
      let remainder = budget - shares.reduce(function (sum, share) { return sum + share.value; }, 0);
      shares.slice().sort(function (a, b) { return b.fraction - a.fraction; }).forEach(function (share) { if (remainder > 0) { share.value += 1; remainder -= 1; } });
      shares.forEach(function (share) { stats[share.key] = share.value; });
      warnings.push("แต้มรวม " + total + " เกิน " + budget + " จึงลดทุกค่าตามสัดส่วน");
      total = budget;
    }
    const skill = monster && monster.skill;
    const trait = monster && monster.trait === undefined ? "none" : monster && monster.trait;
    const element = elementKey(monster && monster.element);
    if (typeof skill !== "string" || !has(skills, skill)) errors.push("skill ไม่ถูกต้อง: ใช้ " + Object.keys(skills).join(", "));
    if (typeof trait !== "string" || !has(traits, trait)) errors.push("trait ไม่ถูกต้อง: ใช้ " + Object.keys(traits).join(", "));
    if (!element) errors.push("element ไม่ถูกต้อง: ใช้ wind, rock, plant, fire, water, ice หรือ lightning");
    return { valid: errors.length === 0, total: total, rawTotal: canTotal ? rawTotal : null, errors: errors, warnings: warnings, monster: Object.assign({}, monster, { stats: stats, skill: skill, trait: trait, element: element }) };
  }

  // ---------- รวมทีมของนักเรียน 1 คน: ต้องมี id ลงท้าย 1, 2, 3 อย่างละตัว ----------
  function team(owner, registry) {
    const errors = [];
    const warnings = [];
    const members = (registry || []).filter(function (monster) { return monster && monster.owner === owner; });
    const slots = [null, null, null];
    members.forEach(function (monster) {
      const match = typeof monster.id === "string" && monster.id.match(/([1-3])$/);
      if (!match) { errors.push("id \"" + monster.id + "\" ต้องลงท้ายด้วย 1, 2 หรือ 3"); return; }
      const slot = Number(match[1]) - 1;
      if (slots[slot]) errors.push("มี id ลงท้ายด้วย " + match[1] + " มากกว่า 1 ตัว");
      else slots[slot] = monster;
    });
    slots.forEach(function (monster, index) { if (!monster) errors.push("ไม่พบมอนสเตอร์ลำดับที่ " + (index + 1) + " (id ลงท้ายด้วย " + (index + 1) + ")"); });
    const checks = slots.map(function (monster) { return monster ? validate(monster, registry) : null; });
    checks.forEach(function (check, index) {
      if (!check) return;
      const label = "ตัวที่ " + (index + 1) + " (" + (slots[index].name || slots[index].id) + ")";
      if (!check.valid) errors.push(label + ": " + check.errors.join(", "));
      check.warnings.forEach(function (warning) { warnings.push(label + ": " + warning); });
    });
    const monsters = checks.map(function (check) { return check && check.monster; });
    const valid = errors.length === 0;
    return { owner: owner, valid: valid, errors: errors, warnings: warnings, monsters: monsters, buffs: valid ? teamBuffs(monsters.map(function (m) { return m.element; })) : null };
  }

  // ---------- เส้นทางรูป: นักเรียนใช้ images/ ในโฟลเดอร์ตัวเอง ระบบใช้ assets/ ----------
  const imagePattern = /^[\w\-./฀-๿ ]+\.(svg|png|jpe?g|webp)$/i;
  function imageSrc(monster) {
    const fallback = "assets/placeholder.svg";
    const path = monster && monster.image;
    if (typeof path !== "string" || path.includes("..") || !imagePattern.test(path)) return fallback;
    if (monster.imageBase) return path.indexOf("images/") === 0 ? monster.imageBase + path : fallback;
    return path.indexOf("assets/") === 0 ? path : fallback;
  }

  return { rules: rules, validate: validate, team: team, teamBuffs: teamBuffs, matchup: matchup, elementKey: elementKey, imageSrc: imageSrc, statKeys: statKeys, labels: labels, limits: limits, budget: budget, descriptions: descriptions, skills: skills, traits: traits, elements: elements };
}());

// ไฟล์ของนักเรียนเรียกฟังก์ชันนี้เพื่อส่งมอนสเตอร์ทั้ง 3 ตัวเข้าเกม
// owner คือรหัสเจ้าของ ("a" หรือ "b") ใช้หาโฟลเดอร์รูป ../student-<owner>/images/
window.registerMonsters = function (owner, list) {
  const safeOwner = typeof owner === "string" && /^[a-z0-9-]+$/.test(owner) ? owner : null;
  (Array.isArray(list) ? list : [list]).forEach(function (monster) {
    if (!monster || typeof monster !== "object" || !safeOwner) { window.MONSTERS.push(monster); return; }
    window.MONSTERS.push(Object.assign({}, monster, { owner: safeOwner, imageBase: "../student-" + safeOwner + "/" }));
  });
};
