"use strict";
// app.js ควบคุมหน้าเว็บ: ตรวจทีม เล่นการต่อสู้ทีละเทิร์น หยุดรอเมื่อมีตัวหมดแรง และแสดงผล
(function () {
  const data = window.ForgeData;
  const battle = window.ForgeBattle;
  const owners = ["a", "b"];                                                  // ทีมซ้าย = นักเรียน A, ทีมขวา = นักเรียน B
  const teams = owners.map(function (owner) { return data.team(owner, window.MONSTERS); });   // ตรวจข้อมูลทั้งสองทีมจากไฟล์นักเรียน
  const ready = teams.every(function (team) { return team.valid; });         // พร้อมต่อสู้เมื่อทั้งสองทีมถูกต้อง
  const $ = function (id) { return document.getElementById(id); };
  const panels = [$("team-0"), $("team-1")];
  const STEP_MS = 1100;                                                       // เวลาระหว่างแต่ละเทิร์น (มิลลิวินาที)
  let simulation = null;                                                      // ผลการต่อสู้ที่จำลองไว้ล่วงหน้า
  let eventIndex = 0;                                                         // เหตุการณ์ถัดไปที่จะแสดง
  let timer = null;
  let mode = "idle";                                                          // idle = ยังไม่เริ่ม / playing = กำลังสู้ / paused = รอกดสู้ต่อ / finished = จบ
  let matchup = 1;                                                            // คู่ต่อสู้คู่ที่เท่าไหร่
  const shown = [null, null];
  const skillStyle = { strike: ["💥", "#d9480f"], critStrike: ["🎯", "#c2255c"], poison: ["☠️", "#7048e8"], heal: ["💚", "#2b8a3e"], shield: ["🛡️", "#1971c2"] };   // ไอคอนและสีของป้ายสกิล                                                 // มอนสเตอร์ที่แสดงอยู่ของแต่ละฝั่ง (ไว้เช็กว่าเปลี่ยนตัวหรือยัง)

  // สร้าง element HTML พร้อม class และข้อความ
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ป้ายธาตุสี เช่น [น้ำแข็ง]
  function elementTag(key) {
    const info = data.elements[key];
    const tag = element("span", "el-tag", "[" + info.name + "]");
    tag.style.background = info.color;
    tag.style.color = info.ink;
    return tag;
  }

  // ชื่อมอนสเตอร์พร้อมป้ายธาตุนำหน้า
  function monsterLabel(monster) {
    const label = element("span", "monster-label");
    label.append(elementTag(monster.element), " " + monster.name);
    return label;
  }

  // แปลงข้อความจาก battle.js (ข้อความ + อ้างอิงมอนสเตอร์) เป็น HTML
  function renderMessage(parts) {
    const line = element("span", "log-line");
    parts.forEach(function (part) {
      if (typeof part === "string") line.append(part);
      else line.append(monsterLabel(simulation.teams[part.side].monsters[part.index]));
    });
    return line;
  }

  // แสดงบัพของทีม
  function renderBuffs(side, buffs) {
    const box = panels[side].querySelector(".buffs");
    box.replaceChildren();
    if (!buffs) return;
    const power = data.rules.buffScale[buffs.active.length] || 1;               // บัพน้อยตัว = แรงขึ้น
    buffs.active.forEach(function (key) {
      const chip = element("span", "buff");
      chip.append(elementTag(key), " " + data.elements[key].buff);
      if (power !== 1) chip.append(element("strong", "power", " แรง ×" + power));
      box.append(chip);
    });
  }

  // ป้ายด้านบน: ตัวที่เท่าไหร่ และวงกลมลำดับ 1 2 3 (✕ = หมดแรง, สีเต็ม = กำลังสู้)
  function renderSlots(side, state) {
    const active = state ? state.active : 0;
    panels[side].querySelector(".slot-number").textContent = active + 1;
    const slots = panels[side].querySelector(".slots");
    slots.replaceChildren();
    for (let i = 0; i < 3; i += 1) {
      const down = state && state.units[i].hp <= 0;
      const className = down ? "slot down" : (i === active ? "slot current" : "slot");
      slots.append(element("span", className, down ? "✕" : String(i + 1)));
    }
  }

  // ตั้งความกว้างของแถบ (ใส่ transition ได้)
  function setWidth(node, percent, transition) {
    node.style.transition = transition || "none";
    node.style.width = percent + "%";
  }

  // ตัวเลขลอยขึ้นเหนือมอนสเตอร์ เช่น -27 (แดง) หรือ +9 (เขียว)
  function floatText(side, text, className) {
    const layer = panels[side].querySelector(".floats");
    const node = element("span", "float " + className, text);
    node.style.left = (className === "heal" ? 56 + Math.random() * 14 : 22 + Math.random() * 14) + "%";   // ดาเมจลอยฝั่งซ้าย ฟื้น HP ลอยฝั่งขวา
    layer.append(node);
    setTimeout(function () { node.remove(); }, 1400);
  }

  // วาดหลอดเลือด: โดนตี = แถบแดงค่อย ๆ หดตาม / ฟื้น HP = แถบเขียวสว่างโผล่ก่อนแล้วหลอดจริงค่อยเติมตาม
  function renderHp(side, unit, delta, animate) {
    const bar = panels[side].querySelector(".hpbar");
    const fill = bar.querySelector(".hp-fill");
    const lag = bar.querySelector(".hp-lag");
    const gain = bar.querySelector(".hp-gain");
    const percent = Math.max(0, unit.hp / unit.max * 100);
    const before = parseFloat(fill.style.width || "100");
    bar.classList.toggle("low", percent <= 35);
    if (!animate) { [fill, lag, gain].forEach(function (node) { setWidth(node, percent); }); return; }
    if (percent < before) {                                                   // เลือดลด
      setWidth(gain, percent);
      setWidth(fill, percent, "width .2s ease-out");
      setWidth(lag, before);
      void lag.offsetWidth;                                                   // บังคับให้เบราว์เซอร์จำความกว้างเดิมก่อนเริ่ม transition
      setWidth(lag, percent, "width .7s ease-in .45s");
    } else if (percent > before) {                                            // เลือดเพิ่ม
      setWidth(lag, percent);
      setWidth(gain, percent);
      setWidth(fill, before);
      void fill.offsetWidth;
      setWidth(fill, percent, "width .7s ease-out .45s");
    }
    if (delta && delta.damage) {                                              // โดนตี: ตัวเลขแดง (คริติคอลตัวใหญ่ขึ้น)
      floatText(side, (delta.crit ? "💥 -" : "-") + delta.damage, delta.crit ? "damage crit" : "damage");
      flash(side, "hit");
    }
    if (delta && delta.dodge) {                                               // หลบได้: คำว่า หลบ! ลอยขึ้น และตัวเอียงหลบ
      setTimeout(function () { floatText(side, delta.dodge > 1 ? "หลบ! ×" + delta.dodge : "หลบ!", "miss"); }, delta.damage ? 300 : 0);
      flash(side, "dodged");
    }
    if (delta && delta.heal) {
      setTimeout(function () { floatText(side, "+" + delta.heal, "heal"); }, delta.damage ? 300 : 0);
      if (!delta.damage) flash(side, "healed");
    }
  }

  // ป้ายสกิลตัวใหญ่ด้านบนการ์ด เช่น 💥 โจมตีหนัก!
  function showSkill(side, key) {
    const banner = panels[side].querySelector(".skill-banner");
    const style = skillStyle[key] || ["✨", "#355cc9"];
    banner.textContent = style[0] + " " + data.skills[key].name + "!";
    banner.style.background = style[1];
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
  }

  // กระพริบการ์ดสั้น ๆ (แดงเมื่อโดนตี เขียวเมื่อฟื้น)
  function flash(side, className) {
    const fighter = panels[side].querySelector(".fighter");
    fighter.classList.remove("hit", "healed", "dodged");
    void fighter.offsetWidth;
    fighter.classList.add(className);
  }

  // วาดมอนสเตอร์ที่อยู่ในสนามของฝั่งนั้น (state = null คือก่อนเริ่ม ยังไม่เปิดเผย)
  function renderFighter(side, state, delta, animate) {
    const panel = panels[side];
    const img = panel.querySelector("img");
    const name = panel.querySelector(".fighter-name");
    const effects = panel.querySelector(".fighter-effects");
    renderSlots(side, state);
    if (!state) {
      shown[side] = null;
      img.onerror = null;
      img.src = "assets/placeholder.svg";
      img.alt = "มอนสเตอร์ปริศนา";
      panel.querySelector(".portrait").classList.add("hidden-monster");
      name.textContent = "???";
      panel.querySelector(".hp-value").textContent = "HP —";
      renderHp(side, { hp: 1, max: 1 }, null, false);
      effects.textContent = "";
      return;
    }
    const monster = simulation.teams[side].monsters[state.active];
    const unit = state.units[state.active];
    const changed = shown[side] !== state.active;                             // เพิ่งเปลี่ยนตัวลงสนาม
    shown[side] = state.active;
    if (changed) {
      panel.querySelector(".portrait").classList.remove("hidden-monster");
      img.onerror = function () { img.onerror = null; img.src = "assets/placeholder.svg"; };
      img.src = data.imageSrc(monster);
      img.alt = "รูป " + monster.name;
      name.replaceChildren(monsterLabel(monster));
      panel.querySelector(".fighter").classList.remove("enter");
      void panel.offsetWidth;
      panel.querySelector(".fighter").classList.add("enter");
    }
    renderHp(side, unit, delta, animate && !changed);
    panel.querySelector(".hp-value").textContent = "HP " + unit.hp + " / " + unit.max;
    panel.querySelector(".portrait").classList.toggle("fainted", unit.hp <= 0);
    const notes = [data.skills[monster.skill].name, data.traits[monster.trait].name];
    if (unit.shield) notes.push("🛡️ โล่ " + unit.shield);
    if (unit.poison) notes.push("☠️ พิษ " + unit.poison + " เทิร์น");
    if (unit.defenseDown) notes.push("DEF −" + unit.defenseDown);
    if (unit.speedDown) notes.push("SPD −" + unit.speedDown);
    effects.textContent = notes.join(" · ");
  }

  // แสดงเฉพาะปุ่มที่ใช้ได้ในสถานะปัจจุบัน
  function updateControls() {
    $("start").hidden = mode !== "idle";
    $("start").disabled = !ready;
    $("skip").hidden = mode !== "playing";
    $("continue").hidden = mode !== "paused";
    $("rematch").hidden = mode !== "finished";
  }

  // เพิ่มบรรทัดในบันทึกการต่อสู้
  function log(className, label, messages) {
    const item = element("li", className);
    if (label) item.append(element("strong", "", label + " "));
    messages.forEach(function (parts, index) {
      if (index) item.append(" · ");
      item.append(renderMessage(parts));
    });
    $("battle-log").append(item);
    $("battle-log").scrollTop = $("battle-log").scrollHeight;
  }

  // หัวข้อคั่นในบันทึกเมื่อเริ่มคู่ใหม่
  function logMatchup(state) {
    log("matchup", "คู่ที่ " + matchup + ":", [[{ side: 0, index: state[0].active }, " ปะทะ ", { side: 1, index: state[1].active }]]);
  }

  // เขียนเหตุการณ์ 1 รายการลงบันทึก
  function logEvent(event) {
    if (event.type === "swap") log("swap", "🔄", event.messages);
    else log("", "เทิร์นที่ " + event.turn, event.messages);
    $("turn-count").textContent = "เทิร์นที่ " + event.turn;
  }

  // จบคู่ปัจจุบัน: ถ้ายังมีเหตุการณ์ต่อ = หยุดรอกด สู้ต่อ, ถ้าไม่มี = จบเกม
  function endOfMatchup(event) {
    clearInterval(timer); timer = null;
    if (eventIndex >= simulation.events.length) { finish(); return; }
    mode = "paused";
    const lost = event.knockout.map(function (side) { return "ทีม " + owners[side].toUpperCase(); }).join(" และ ");
    $("result").textContent = lost + " เสียมอนสเตอร์ 1 ตัว! กด สู้ต่อ เพื่อส่งตัวถัดไปลงสนาม";
    updateControls();
  }

  // จบการต่อสู้: ประกาศผู้ชนะ
  function finish() {
    clearInterval(timer); timer = null;
    mode = "finished";
    const winner = simulation.winner;
    const reason = simulation.reason === "turn-limit" ? " (ครบ " + data.rules.maxTurns + " เทิร์น ตัดสินจากตัวที่เหลือ)" : "";
    $("result").textContent = winner === null ? "เสมอ! หมดแรงพร้อมกันทั้งสองทีม" : "🏆 ทีม " + owners[winner].toUpperCase() + " ชนะ!" + reason;
    $("result").classList.add("finished");
    updateControls();
  }

  // เล่น 1 เทิร์นแบบมีแอนิเมชัน (เรียกทุก STEP_MS)
  function step() {
    const event = simulation.events[eventIndex];
    if (!event) { finish(); return; }
    eventIndex += 1;
    logEvent(event);
    [0, 1].forEach(function (side) {
      renderFighter(side, event.state[side], event.delta[side], true);
      if (event.skills && event.skills[side]) showSkill(side, event.skills[side]);   // เทิร์นนี้ใช้สกิล
    });
    if (event.knockout && event.knockout.length) endOfMatchup(event);
  }

  // ดูผลทันที: ข้ามไปจนจบคู่ปัจจุบันเท่านั้น
  function skip() {
    if (mode !== "playing") return;
    clearInterval(timer); timer = null;
    const total = [{ damage: 0, heal: 0 }, { damage: 0, heal: 0 }];
    let event = null;
    while (eventIndex < simulation.events.length) {
      event = simulation.events[eventIndex];
      eventIndex += 1;
      logEvent(event);
      [0, 1].forEach(function (side) { total[side].damage += event.delta[side].damage; total[side].heal += event.delta[side].heal; });
      if (event.knockout && event.knockout.length) break;
    }
    if (!event) { finish(); return; }
    [0, 1].forEach(function (side) { renderFighter(side, event.state[side], total[side], true); });
    if (event.knockout && event.knockout.length) endOfMatchup(event);
    else finish();
  }

  // สู้ต่อ: ส่งตัวถัดไปลงสนาม แล้วเล่นต่ออัตโนมัติ
  function resume() {
    if (mode !== "paused") return;
    const swap = simulation.events[eventIndex];
    if (swap && swap.type === "swap") {
      eventIndex += 1;
      logEvent(swap);
      [0, 1].forEach(function (side) { renderFighter(side, swap.state[side], null, false); });
      matchup += 1;
      logMatchup(swap.state);
    }
    mode = "playing";
    $("result").textContent = "คู่ที่ " + matchup + " กำลังต่อสู้…";
    updateControls();
    timer = setInterval(step, STEP_MS);
  }

  // เริ่มการต่อสู้ใหม่ทั้งเกม
  function start() {
    if (!ready || mode === "playing") return;
    clearInterval(timer);
    simulation = battle.simulate(teams[0], teams[1]);
    eventIndex = 0; matchup = 1; mode = "playing";
    shown[0] = shown[1] = null;
    $("battle-log").replaceChildren();
    $("result").textContent = "คู่ที่ 1 กำลังต่อสู้…";
    $("result").classList.remove("finished");
    $("turn-count").textContent = "เทิร์นที่ 0";
    [0, 1].forEach(function (side) { renderBuffs(side, teams[side].buffs); renderFighter(side, simulation.initial[side], null, false); });
    logMatchup(simulation.initial);
    updateControls();
    timer = setInterval(step, STEP_MS);
  }

  // แสดงข้อผิดพลาดและคำเตือนจากไฟล์นักเรียน
  function renderChecks() {
    const errors = $("team-errors");
    const warnings = $("team-warnings");
    teams.forEach(function (team) {
      const file = "student-" + team.owner + "/monsters.js";
      if (team.errors.length) {
        errors.append(element("p", "", "ทีม " + team.owner.toUpperCase() + " ยังสู้ไม่ได้ — ตรวจไฟล์ " + file));
        const list = element("ul");
        team.errors.forEach(function (text) { list.append(element("li", "", text)); });
        errors.append(list);
      }
      if (team.warnings.length) {
        warnings.append(element("p", "", "ทีม " + team.owner.toUpperCase() + " ใส่แต้มเกิน ระบบปรับให้อัตโนมัติ:"));
        const list = element("ul");
        team.warnings.forEach(function (text) { list.append(element("li", "", text)); });
        warnings.append(list);
      }
    });
    if (!window.MONSTERS.some(function (m) { return m && m.owner; })) errors.append(element("p", "", "ไม่พบไฟล์มอนสเตอร์เลย อาจพิมพ์เครื่องหมายผิดจน JavaScript อ่านไม่ได้ กด F12 > Console เพื่อดูบรรทัดที่ผิด"));
    errors.hidden = !errors.childNodes.length;
    warnings.hidden = !warnings.childNodes.length;
    if (!ready) $("result").textContent = "แก้ไฟล์ให้ถูกต้องก่อน แล้วรีเฟรชหน้าเว็บ (F5)";
  }

  // เขียนหน้ากติกาจากค่าใน data.js (ตัวเลขตรงกับระบบจริงเสมอ)
  function renderRules() {
    const body = $("rules-body");
    const order = ["wind", "rock", "plant", "fire", "water", "ice", "lightning", "wind"];
    const chain = element("p", "chain");
    order.forEach(function (key, index) { if (index) chain.append(" ← "); chain.append(elementTag(key)); });
    body.append(element("h3", "", "ธาตุ (ซ้ายแพ้ขวา)"), chain);
    body.append(element("p", "", "มีผลเฉพาะมอนสเตอร์ 2 ตัวที่กำลังสู้กันอยู่ (ธาตุในทีมเดียวกันไม่ข่มกัน) · ตีธาตุที่ชนะ แรง ×" + data.rules.advantage + " · ตีธาตุที่แพ้ เบา ×" + data.rules.disadvantage + " และบัพทีมไม่ทำงานในการโจมตีนั้น"));
    body.append(element("h3", "", "บัพทีม"));
    body.append(element("p", "", "นับธาตุที่ไม่ซ้ำกันในทีม: 3 ธาตุ = 3 บัพ · 2 ธาตุ = 2 บัพ (แรง ×" + data.rules.buffScale[2] + ") · ธาตุเดียว = 1 บัพ (แรง ×" + data.rules.buffScale[1] + ")"));
    Object.keys(data.elements).forEach(function (key) { const p = element("p"); p.append(elementTag(key), " " + data.elements[key].buff); body.append(p); });
    body.append(element("h3", "", "สกิล (ทำงานทุก " + data.rules.skillEvery + " เทิร์นของตัวเอง)"));
    Object.keys(data.skills).forEach(function (key) { body.append(element("p", "", key + " — " + data.skills[key].name + ": " + data.skills[key].description)); });
    body.append(element("h3", "", "ติดตัว"));
    Object.keys(data.traits).forEach(function (key) { body.append(element("p", "", key + " — " + data.traits[key].name + ": " + data.traits[key].description)); });
    body.append(element("h3", "", "สเตตัส (รวมไม่เกิน " + data.budget + " แต้ม)"));
    data.statKeys.forEach(function (key) { body.append(element("p", "", key + " ≤ " + data.limits[key] + " · " + data.descriptions[key])); });
    body.append(element("p", "muted", "หลังเทิร์นที่ " + data.rules.fatigueStart + " ทุกตัวเริ่มเหนื่อยล้า การโจมตีแรงขึ้นทุกเทิร์น เพื่อไม่ให้เกมยืดเยื้อ"));
  }

  renderRules();
  renderChecks();
  [0, 1].forEach(function (side) { renderFighter(side, null); });
  updateControls();
  $("start").addEventListener("click", start);
  $("rematch").addEventListener("click", start);
  $("skip").addEventListener("click", skip);
  $("continue").addEventListener("click", resume);
}());
