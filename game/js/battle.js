"use strict";
// ForgeBattle จำลองการต่อสู้ทีมละ 3 ตัวทั้งเกมล่วงหน้า แล้วส่งรายการเหตุการณ์ให้หน้าเว็บเล่นทีละเทิร์น
window.ForgeBattle = (function () {
  const data = window.ForgeData;
  const R = data.rules;

  // HP สูงสุดของมอนสเตอร์ที่ผ่านการตรวจแล้ว
  function maxHP(monster) { return Math.round((R.hpBase + monster.stats.hp * R.hpPerPoint) * (monster.trait === "none" ? 1 + R.noneBonus : 1)); }

  // teamA / teamB คือผลจาก ForgeData.team(...) ที่ valid แล้ว, random ใส่เพื่อทดสอบได้ (ค่าเริ่มต้น Math.random)
  function simulate(teamA, teamB, random) {
    [teamA, teamB].forEach(function (team) { if (!team || !team.valid) throw new Error("ทีมยังไม่พร้อมต่อสู้: " + (team && team.errors ? team.errors.join(" · ") : "ไม่มีข้อมูลทีม")); });
    const rng = random || Math.random;
    // สร้างสถานะในสนามของแต่ละฝั่ง: ตัวที่กำลังสู้ (active) และค่าที่เปลี่ยนระหว่างเกมของมอนสเตอร์แต่ละตัว
    const sides = [teamA, teamB].map(function (team, sideIndex) {
      return {
        owner: team.owner,
        buffs: team.buffs.active,
        power: R.buffScale[team.buffs.active.length] || 1,                                                   // บัพยิ่งน้อยยิ่งแรง
        revived: false,
        active: 0,
        units: team.monsters.map(function (monster) { const max = maxHP(monster); return { side: sideIndex, monster: monster, max: max, hp: max, shield: 0, poison: 0, actions: 0, defenseDown: 0, speedDown: 0, revived: false }; })
      };
    });
    const events = [];
    let event = null;
    const newDelta = function () { return [{ damage: 0, heal: 0, dodge: 0, crit: false }, { damage: 0, heal: 0, dodge: 0, crit: false }]; };   // ดาเมจ/ฟื้น HP ของแต่ละฝั่งในเหตุการณ์นี้

    const unit = function (side) { return sides[side].units[sides[side].active]; };                       // ตัวที่อยู่ในสนามของฝั่งนั้น
    const ref = function (side) { return { side: side, index: sides[side].active }; };                     // อ้างอิงชื่อ+ธาตุสำหรับข้อความ
    const hasBuff = function (side, key) { return sides[side].buffs.indexOf(key) !== -1; };               // ฝั่งนี้มีบัพธาตุนี้ไหม
    const speedOf = function (u) { return Math.max(0, u.monster.stats.speed - u.speedDown); };              // speed หลังโดนน้ำแข็ง
    const defenseOf = function (u) { return Math.max(-R.defenseFloor, u.monster.stats.defense - u.defenseDown); };   // defense หลังโดนสายฟ้า (ติดลบได้ = โดนแรงขึ้น)
    const say = function () { event.messages.push(Array.prototype.slice.call(arguments)); };                // เพิ่มข้อความ 1 บรรทัดในเหตุการณ์ปัจจุบัน
    const snapshot = function () {                                                                         // ถ่ายภาพสถานะทั้งสนามให้หน้าเว็บวาด
      return sides.map(function (s) { return { active: s.active, units: s.units.map(function (u) { return { hp: u.hp, max: u.max, shield: u.shield, poison: u.poison, defenseDown: u.defenseDown, speedDown: u.speedDown }; }) }; });
    };
    const firstMover = function () {                                                                       // ตัวที่ speed สูงกว่าได้ตีก่อน เท่ากันสุ่ม
      const a = speedOf(unit(0)); const b = speedOf(unit(1));
      return a === b ? (rng() < 0.5 ? 0 : 1) : (a > b ? 0 : 1);
    };
    const heal = function (u, amount) { const restored = Math.max(0, Math.min(u.max - u.hp, Math.round(amount))); u.hp += restored; event.delta[u.side].heal += restored; return restored; };

    // ลด HP โดยตรง (ไม่ผ่านโล่) และเช็กบัพน้ำกันตาย คืนค่าดาเมจที่เข้าเลือดจริง
    function loseHp(side, u, amount) {
      const dealt = Math.min(u.hp, Math.max(0, Math.round(amount)));
      u.hp -= dealt;
      event.delta[side].damage += dealt;                                                                  // จดดาเมจไว้ให้หลอดเลือดแสดง
      const used = R.waterOncePerTeam ? sides[side].revived : u.revived;
      if (u.hp === 0 && !used && hasBuff(side, "water")) {
        u.revived = true;
        sides[side].revived = true;
        u.hp = Math.max(1, Math.round(u.max * R.waterRevive * sides[side].power));
        event.delta[side].heal += u.hp;
        say(ref(side), " รอดตายด้วยพลังน้ำ! ฟื้นเป็น " + u.hp + " HP");
      }
      return dealt;
    }

    // โจมตี 1 ครั้ง: โล่รับก่อน ส่วนที่เหลือเข้าเลือด คืน { absorbed, dealt }
    function hit(side, u, amount) {
      const absorbed = Math.min(u.shield, amount);
      u.shield -= absorbed;
      return { absorbed: absorbed, dealt: loseHp(side, u, amount - absorbed) };
    }

    // การโจมตีของฝั่ง s ใส่ฝั่ง o (skill = "strike" / "poison" / null)
    function attack(s, o, skill) {
      const u = unit(s); const t = unit(o);
      const element = data.matchup(u.monster.element, t.monster.element);
      const buffsOn = element >= 1;                                                                        // ตีธาตุที่เราแพ้ บัพทีมไม่ทำงาน
      const dodge = Math.min(R.dodgeCap, t.monster.stats.evasion * R.evasionPerPoint + speedOf(t) * R.speedDodge + u.speedDown * R.iceMiss) / 100;   // หลบ = หลบหลีก + speed ของเป้าหมาย + ผู้โจมตีโดนน้ำแข็ง
      const action = skill ? " ใช้" + data.skills[skill].name : " โจมตี";
      if (rng() < dodge) { event.delta[o].dodge += 1; say(ref(o), " หลบการโจมตีของ ", ref(s), " ได้"); return; }   // จดการหลบไว้ให้หน้าเว็บแสดง
      const critical = rng() < (u.monster.stats.critical * R.critPerPoint + (skill === "critStrike" ? R.critStrikeChance : 0)) / 100;   // โจมตีจุดตายเพิ่มโอกาสคริ
      if (critical) event.delta[o].crit = true;
      const critPower = R.critPower + (u.monster.trait === "hardCrit" ? R.hardCritBonus : 0);   // คริรุนแรงเพิ่มตัวคูณคริ
      const defense = defenseOf(t);
      const pierced = defense > 0 ? defense * Math.max(0, 1 - u.monster.stats.armorPierce * R.piercePerPoint / 100) : defense;   // เจาะเกราะลดเฉพาะ DEF ที่เป็นบวก
      const skillPower = skill === "strike" ? R.strikePower : (skill === "poison" ? R.poisonPower : (skill === "critStrike" ? R.critStrikePower : 1));
      const berserk = u.monster.trait === "berserk" && u.hp <= u.max * R.berserkAt ? R.berserkPower : 1;
      const power = sides[s].power;
      const wind = buffsOn && hasBuff(s, "wind") ? 1 + R.windPower * power : 1;
      const bonus = (1 + u.monster.stats.armorPierce * R.pierceBonus) * (u.monster.trait === "none" ? 1 + R.noneBonus : 1);
      const fatigue = 1 + Math.max(0, turn - R.fatigueStart) * R.fatigueStep;                             // เหนื่อยล้า: ยิ่งเกมยาวยิ่งแรง
      const damage = Math.max(1, Math.round((R.damageBase + u.monster.stats.attack * R.damagePerAttack) * R.defenseScale / (R.defenseScale + pierced) * (0.9 + rng() * 0.2) * skillPower * berserk * (critical ? critPower : 1) * element * wind * fatigue * bonus));
      const main = hit(o, t, damage);
      const note = (critical ? " คริติคอล!" : "") + (element > 1 ? " ได้เปรียบธาตุ!" : (element < 1 ? " เสียเปรียบธาตุ…" : ""));
      say(ref(s), action + note + " → ", ref(o), " เสีย " + main.dealt + " HP" + (main.absorbed ? " (โล่รับ " + main.absorbed + ")" : ""));
      let dealt = main.dealt;
      if (buffsOn && hasBuff(s, "fire") && t.hp > 0) {                                                   // บัพไฟ: เผาซ้ำ
        const burn = hit(o, t, Math.max(1, Math.round(damage * R.fireExtra * power)));
        dealt += burn.dealt;
        say("🔥 เผาซ้ำ → ", ref(o), " เสียอีก " + burn.dealt + " HP");
      }
      const stolen = heal(u, Math.floor(dealt * u.monster.stats.lifesteal * R.lifestealPerPoint / 100));                         // ดูดเลือดจากสเตตัส
      if (stolen) say(ref(s), " ดูดเลือด +" + stolen + " HP");
      if (buffsOn && hasBuff(s, "plant")) {                                                              // บัพพืช: ฟื้น HP
        const restored = heal(u, dealt * R.plantHeal * power);
        if (restored) say("🌿 ", ref(s), " ฟื้น +" + restored + " HP");
      }
      if (buffsOn && hasBuff(s, "rock")) {                                                               // บัพหิน: ได้โล่
        const gained = Math.max(0, Math.min(Math.floor(u.max * R.shieldCap) - u.shield, Math.round(dealt * R.rockShield * power)));
        u.shield += gained;
        if (gained) say("🪨 ", ref(s), " ได้โล่ +" + gained);
      }
      if (buffsOn && hasBuff(s, "lightning") && t.hp > 0 && t.defenseDown < Math.round(R.lightningMax * power)) {   // บัพสายฟ้า: ลด DEF
        t.defenseDown = Math.min(Math.round(R.lightningMax * power), t.defenseDown + Math.round(R.lightningDefense * power));
        say("⚡ ", ref(o), " DEF ลดลงรวม " + t.defenseDown);
      }
      if (buffsOn && hasBuff(s, "ice") && t.hp > 0 && t.speedDown < Math.round(R.iceMax * power)) {      // บัพน้ำแข็ง: ลด SPD
        t.speedDown = Math.min(Math.round(R.iceMax * power), t.speedDown + Math.round(R.iceSpeed * power));
        say("❄️ ", ref(o), " SPD ลดลงรวม " + t.speedDown);
      }
      if (skill === "poison" && t.hp > 0) { t.poison = R.poisonTurns; say(ref(o), " ติดพิษ " + R.poisonTurns + " เทิร์น"); }
      if (t.monster.trait === "thorns" && main.dealt > 0 && u.hp > 0) {                                    // ติดตัวหนาม: สะท้อนดาเมจ
        const reflected = loseHp(s, u, Math.floor(main.dealt * R.thornsRate));
        if (reflected) say(ref(s), " โดนหนามสะท้อน " + reflected + " HP");
      }
    }

    // เทิร์นเดียวของฝั่ง s: รับพิษ → ฟื้นตัว → ใช้สกิลหรือโจมตี
    function takeTurn(s) {
      const o = 1 - s;
      const u = unit(s);
      if (u.poison > 0) {
        const poisoned = loseHp(s, u, Math.max(1, Math.round(u.max * R.poisonRate)));
        u.poison -= 1;
        say(ref(s), " เสีย " + poisoned + " HP จากพิษ");
      }
      if (u.hp <= 0) return;
      if (u.monster.trait === "regeneration") {
        const restored = heal(u, u.max * R.regenRate);
        if (restored) say(ref(s), " ฟื้นตัว +" + restored + " HP");
      }
      u.actions += 1;
      const skill = u.actions % R.skillEvery === 0 ? u.monster.skill : null;
      if (skill) event.skills[s] = skill;                                                                   // บอกหน้าเว็บว่าเทิร์นนี้ใช้สกิลอะไร
      if (skill === "heal") {                                                                              // ฟื้นพลังก่อน แล้วโจมตีปกติ
        say(ref(s), " ใช้ฟื้นพลัง +" + heal(u, u.max * R.healRate) + " HP");
        attack(s, o, null);
      } else if (skill === "shield") {                                                                     // สร้างโล่ก่อน แล้วโจมตีปกติ
        const gained = Math.max(0, Math.min(Math.floor(u.max * R.shieldCap) - u.shield, Math.round(u.max * R.shieldRate)));
        u.shield += gained;
        say(ref(s), " สร้างโล่ +" + gained + " (รวม " + u.shield + ")");
        attack(s, o, null);
      } else {                                                                                             // โจมตีปกติ / โจมตีหนัก / พิษ
        attack(s, o, skill);
      }
      const t = unit(o);
      if (u.hp > 0 && t.hp > 0 && rng() < speedOf(u) * R.speedDouble / 100) {                              // เร็วพอจะโจมตีซ้ำ
        say("💨 ", ref(s), " เร็วมาก! โจมตีซ้ำ");
        attack(s, o, null);
      }
    }

    let attacker = firstMover();
    let winner = null;
    let reason = "turn-limit";
    let turn = 0;
    while (turn < R.maxTurns) {
      turn += 1;
      event = { type: "turn", turn: turn, side: attacker, messages: [], delta: newDelta(), skills: [null, null] };
      takeTurn(attacker);
      const fallen = [0, 1].filter(function (side) { return unit(side).hp <= 0; });            // ฝั่งที่ตัวในสนามหมดแรง
      fallen.forEach(function (side) { say(ref(side), " หมดแรง!"); });
      event.knockout = fallen;                                                                            // ฝั่งที่หมดแรงในเทิร์นนี้ (ใช้หยุดรอกด สู้ต่อ)
      event.state = snapshot();
      events.push(event);
      if (!fallen.length) { attacker = 1 - attacker; continue; }
      fallen.forEach(function (side) { sides[side].active += 1; });                              // ส่งตัวลำดับถัดไปลงสนาม
      const out = [0, 1].filter(function (side) { return sides[side].active >= 3; });           // ฝั่งที่หมดครบ 3 ตัว
      if (out.length) {
        fallen.forEach(function (side) { sides[side].active = Math.min(2, sides[side].active); });
        winner = out.length === 2 ? null : 1 - out[0];
        reason = out.length === 2 ? "double-ko" : "knockout";
        break;
      }
      event = { type: "swap", turn: turn, side: null, messages: [], delta: newDelta(), skills: [null, null] };
      fallen.forEach(function (side) { say(ref(side), " ลงสนาม! (ตัวที่ " + (sides[side].active + 1) + ")"); });
      attacker = firstMover();
      event.state = snapshot();
      events.push(event);
    }
    if (winner === null && reason === "turn-limit") {
      // ครบจำนวนเทิร์น: ฝั่งที่เหลือตัวมากกว่าชนะ ถ้าเท่ากันดู % HP รวม
      const score = sides.map(function (s) { return s.units.reduce(function (sum, u) { return sum + (u.hp > 0 ? 1000 + u.hp / u.max : 0); }, 0); });
      winner = score[0] === score[1] ? null : (score[0] > score[1] ? 0 : 1);
    }
    return {
      events: events,
      winner: winner,
      reason: reason,
      turns: turn,
      teams: sides.map(function (s) { return { owner: s.owner, buffs: s.buffs, monsters: s.units.map(function (u) { return u.monster; }), maxHP: s.units.map(function (u) { return u.max; }) }; }),
      initial: (function () { return sides.map(function (s) { return { active: 0, units: s.units.map(function (u) { return { hp: u.max, max: u.max, shield: 0, poison: 0, defenseDown: 0, speedDown: 0 }; }) }; }); }()),
      final: snapshot()
    };
  }

  return { simulate: simulate, maxHP: maxHP };
}());
