const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function load(files = ['js/data.js', '../student-a/monsters.js', '../student-b/monsters.js', 'js/battle.js']) {
  const context = vm.createContext({});
  context.window = context;
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context));
  return context.window;
}
function seeded(seed = 1) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
const flat = { hp: 20, attack: 20, defense: 10, speed: 10, critical: 10, lifesteal: 10, evasion: 10, armorPierce: 10 };
const calm = { hp: 30, attack: 30, defense: 20, speed: 0, critical: 0, lifesteal: 0, evasion: 0, armorPierce: 20 };
function member(owner, slot, extra = {}) { return { id: owner + slot, name: owner + slot, owner, stats: flat, skill: 'strike', trait: 'none', element: 'fire', ...extra }; }
function makeTeam(w, owner, list) { return w.ForgeData.team(owner, list.map((extra, i) => member(owner, i + 1, extra))); }

test('starter teams are valid, ordered by id suffix, with 3 monsters each', () => {
  const w = load();
  for (const owner of ['a', 'b']) {
    const team = w.ForgeData.team(owner, w.MONSTERS);
    assert.equal(team.valid, true, team.errors.join(' | '));
    assert.deepEqual(Array.from(team.monsters, m => m.id), [owner + '1', owner + '2', owner + '3']);
    assert.equal(team.warnings.length, 0, 'starter stats should fit the budget and caps');
    team.monsters.forEach(m => assert.equal(Object.values(m.stats).reduce((a, b) => a + b, 0), 100));
  }
});

test('HTML loads only local scripts that exist, student images resolve', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts, ['js/data.js', '../student-a/monsters.js', '../student-b/monsters.js', 'js/battle.js', 'js/app.js']);
  scripts.forEach(file => { assert.ok(fs.existsSync(path.join(root, file)), file); new vm.Script(fs.readFileSync(path.join(root, file), 'utf8')); });
  assert.ok(!html.includes('http://') && !html.includes('https://'));
  assert.ok(!html.includes('<select'), 'monsters must not be selectable on the page');
  const w = load();
  w.MONSTERS.forEach(m => { const src = w.ForgeData.imageSrc(m); assert.notEqual(src, 'assets/placeholder.svg'); assert.ok(fs.existsSync(path.join(root, src)), src); });
});

test('element chain: each element beats exactly one and loses to exactly one', () => {
  const { ForgeData: D } = load(['js/data.js']);
  const chain = ['wind', 'rock', 'plant', 'fire', 'water', 'ice', 'lightning'];
  chain.forEach((loser, i) => {
    const winner = chain[(i + 1) % chain.length];
    assert.equal(D.matchup(winner, loser), 1.25, winner + ' > ' + loser);
    assert.equal(D.matchup(loser, winner), 0.75, loser + ' < ' + winner);
  });
  assert.equal(D.matchup('plant', 'wind'), 1);
  assert.equal(D.matchup('wind', 'plant'), 1);
  assert.equal(D.matchup('fire', 'fire'), 1);
  assert.equal(D.elementKey('น้ำแข็ง'), 'ice');
  assert.equal(D.elementKey('ไฟฟ้า'), 'lightning');
  assert.equal(D.elementKey('Fire'), 'fire');
  assert.equal(D.elementKey('lava'), null);
});

test('team buffs: one effect per distinct element, no in-team counters', () => {
  const { ForgeData: D } = load(['js/data.js']);
  assert.deepEqual([...D.teamBuffs(['ice', 'ice', 'ice']).active], ['ice']);
  assert.deepEqual([...D.teamBuffs(['ice', 'fire', 'ice']).active], ['ice', 'fire']);
  assert.deepEqual([...D.teamBuffs(['wind', 'fire', 'ice']).active], ['wind', 'fire', 'ice']);
  const counters = D.teamBuffs(['fire', 'plant', 'wind']);
  assert.deepEqual([...counters.active], ['fire', 'plant', 'wind'], 'elements in the same team never counter each other');
  assert.equal(D.teamBuffs(['rock', 'plant', 'fire']).active.length, 3);
});

test('team validation reports missing slots, duplicate suffixes and bad elements', () => {
  const w = load(['js/data.js']);
  const D = w.ForgeData;
  const missing = D.team('a', [member('a', 1), member('a', 2)]);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some(e => e.includes('ลำดับที่ 3')));
  const dup = D.team('a', [member('a', 1), member('a', 2), { ...member('a', 3), id: 'x1' }]);
  assert.equal(dup.valid, false);
  const badElement = makeTeam(w, 'a', [{}, { element: 'lava' }, {}]);
  assert.equal(badElement.valid, false);
  assert.ok(badElement.errors.some(e => e.includes('element')));
  const thai = makeTeam(w, 'a', [{ element: 'ไฟ' }, { element: 'น้ำ' }, { element: 'ลม' }]);
  assert.equal(thai.valid, true);
  assert.deepEqual(Array.from(thai.monsters, m => m.element), ['fire', 'water', 'wind']);
});

test('battle runs in order 1→2→3, survivors keep HP, loser loses all three', () => {
  const w = load();
  const D = w.ForgeData;
  const teams = ['a', 'b'].map(o => D.team(o, w.MONSTERS));
  for (let seed = 1; seed <= 40; seed++) {
    const r = w.ForgeBattle.simulate(teams[0], teams[1], seeded(seed));
    let prev = r.initial;
    assert.deepEqual(Array.from(prev, s => s.active), [0, 0]);
    for (const e of r.events) {
      e.state.forEach((side, i) => {
        assert.ok(side.active >= prev[i].active && side.active <= 2, 'active only moves forward');
        side.units.forEach(u => { assert.ok(u.hp >= 0 && u.hp <= u.max); });
        if (e.type === 'swap' && side.active === prev[i].active) assert.equal(side.units[side.active].hp, prev[i].units[side.active].hp, 'survivor keeps HP through swap');
      });
      prev = e.state;
    }
    assert.ok(r.turns <= D.rules.maxTurns);
    if (r.winner !== null) {
      assert.ok(r.final[1 - r.winner].units.every(u => u.hp === 0));
      assert.ok(r.final[r.winner].units.some(u => u.hp > 0));
    }
  }
});

test('attacking an element you lose to deals ×0.75 and triggers no team buffs', () => {
  const w = load(['js/data.js', 'js/battle.js']);
  const fireTeam = makeTeam(w, 'a', [{ element: 'fire', stats: calm }, { element: 'fire', stats: calm }, { element: 'fire', stats: calm }]);
  const waterTeam = makeTeam(w, 'b', [{ element: 'water', stats: calm }, { element: 'water', stats: calm }, { element: 'water', stats: calm }]);
  const r = w.ForgeBattle.simulate(fireTeam, waterTeam, () => 0.5);
  const fireAttacks = r.events.filter(e => e.side === 0 && e.type === 'turn');
  assert.ok(fireAttacks.length > 0);
  fireAttacks.forEach(e => e.messages.forEach(m => assert.ok(!m.join('').includes('เผาซ้ำ'), 'no fire buff vs water')));
  assert.ok(fireAttacks.some(e => e.messages.some(m => m.join('').includes('เสียเปรียบธาตุ'))));
  const neutral = makeTeam(w, 'b', [{ element: 'wind', stats: calm }, { element: 'wind', stats: calm }, { element: 'wind', stats: calm }]);
  const r2 = w.ForgeBattle.simulate(fireTeam, neutral, () => 0.5);
  assert.ok(r2.events.some(e => e.side === 0 && e.messages.some(m => m.join('').includes('เผาซ้ำ'))), 'fire buff works on neutral target');
});

test('water buff saves each monster from death once', () => {
  const w = load(['js/data.js', 'js/battle.js']);
  const water = makeTeam(w, 'a', [{ element: 'water', stats: calm }, { element: 'water', stats: calm }, { element: 'water', stats: calm }]);
  const rock = makeTeam(w, 'b', [{ element: 'rock', stats: calm }, { element: 'rock', stats: calm }, { element: 'rock', stats: calm }]);
  const r = w.ForgeBattle.simulate(water, rock, () => 0.5);
  const saves = r.events.flatMap(e => e.messages).filter(m => m.join('').includes('รอดตาย'));
  const saved = new Set(saves.map(m => m[0].index));
  assert.equal(saves.length, saved.size, 'one save per monster');
  assert.ok(saves.length >= 1);
});

test('lightning and ice debuffs stack only up to their caps', () => {
  const w = load(['js/data.js', 'js/battle.js']);
  const R = w.ForgeData.rules;
  const team = makeTeam(w, 'a', [{ element: 'lightning', stats: calm }, { element: 'ice', stats: calm }, { element: 'ice', stats: calm }]);
  const foe = makeTeam(w, 'b', [{ element: 'rock', stats: calm }, { element: 'rock', stats: calm }, { element: 'rock', stats: calm }]);
  const r = w.ForgeBattle.simulate(team, foe, seeded(7));
  const power = R.buffScale[2];
  r.events.forEach(e => e.state[1].units.forEach(u => {
    assert.ok(u.defenseDown <= Math.round(R.lightningMax * power));
    assert.ok(u.speedDown <= Math.round(R.iceMax * power));
  }));
  assert.ok(r.events.some(e => e.state[1].units.some(u => u.defenseDown > 0)));
});

test('caps every stat and the shared budget without mutating source', () => {
  const { ForgeData: D } = load(['js/data.js']);
  const m = { id: 'x1', name: 'x', skill: 'strike', element: 'fire', stats: Object.fromEntries(D.statKeys.map(k => [k, 999])) };
  const before = JSON.stringify(m);
  const checked = D.validate(m, [m]);
  assert.equal(checked.valid, true);
  assert.equal(checked.total, 100);
  for (const [key, value] of Object.entries(checked.monster.stats)) assert.ok(value <= D.limits[key]);
  assert.equal(JSON.stringify(m), before);
  for (const value of [NaN, Infinity, null, '25', undefined]) assert.equal(D.validate({ ...m, stats: { ...m.stats, hp: value } }, []).valid, false);
});

test('student image paths resolve inside their own folder and reject escapes', () => {
  const w = load(['js/data.js']);
  const D = w.ForgeData;
  assert.equal(D.imageSrc({ image: 'images/x.png', imageBase: '../student-a/' }), '../student-a/images/x.png');
  assert.equal(D.imageSrc({ image: '../game/assets/x.svg', imageBase: '../student-a/' }), 'assets/placeholder.svg');
  assert.equal(D.imageSrc({ image: 'https://example.com/x.png', imageBase: '../student-a/' }), 'assets/placeholder.svg');
  w.registerMonsters('../evil', [{ id: 'x1', name: 'x', image: 'images/x.png', stats: {} }]);
  assert.equal(D.imageSrc(w.MONSTERS[w.MONSTERS.length - 1]), 'assets/placeholder.svg');
});

test('battle events carry per-side damage/heal deltas and knockout markers for the UI', () => {
  const w = load();
  const D = w.ForgeData;
  const r = w.ForgeBattle.simulate(D.team('a', w.MONSTERS), D.team('b', w.MONSTERS), seeded(3));
  let prev = r.initial;
  r.events.forEach(e => {
    assert.equal(e.delta.length, 2);
    e.delta.forEach(d => assert.ok(d.damage >= 0 && d.heal >= 0));
    if (e.type === 'turn') {
      const kos = Array.from(e.knockout);
      e.state.forEach((side, i) => {
        const down = side.units[side.active].hp === 0;
        assert.equal(kos.includes(i), down || side.active !== prev[i].active);
      });
    }
    prev = e.state;
  });
  const swaps = r.events.filter(e => e.type === 'swap').length;
  const kos = r.events.filter(e => e.type === 'turn' && e.knockout.length).length;
  assert.equal(swaps, kos - 1, 'every knockout except the last is followed by a swap');
});

test('critStrike raises crit chance, hardCrit raises crit damage, events report skills/dodges/crits', () => {
  const w = load(['js/data.js', 'js/battle.js']);
  const D = w.ForgeData;
  const noCrit = { hp: 30, attack: 30, defense: 20, speed: 0, critical: 0, lifesteal: 0, evasion: 0, armorPierce: 20 };
  const crits = (skill, trait) => {
    const a = makeTeam(w, 'a', [0, 1, 2].map(() => ({ element: 'fire', stats: noCrit, skill, trait })));
    const b = makeTeam(w, 'b', [0, 1, 2].map(() => ({ element: 'fire', stats: noCrit, skill: 'shield', trait: 'none' })));
    let n = 0, hits = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = w.ForgeBattle.simulate(a, b, seeded(seed));
      r.events.forEach(e => { if (e.skills[0]) assert.equal(e.skills[0], skill); if (e.side === 0 && e.delta[1].damage) { hits++; if (e.delta[1].crit) n++; } });
    }
    return n / hits;
  };
  assert.ok(crits('critStrike', 'none') > 0.05, 'critStrike makes crits happen even with 0 critical');
  assert.equal(crits('strike', 'none'), 0);
  assert.ok(D.traits.hardCrit && D.skills.critStrike);
  const strong = { ...noCrit, critical: 25 };
  const dmg = trait => { let sum = 0; for (let seed = 1; seed <= 30; seed++) { const a = makeTeam(w, 'a', [0, 1, 2].map(() => ({ element: 'fire', stats: strong, skill: 'strike', trait }))); const b = makeTeam(w, 'b', [0, 1, 2].map(() => ({ element: 'fire', stats: noCrit, skill: 'strike', trait: 'none' }))); const r = w.ForgeBattle.simulate(a, b, seeded(seed)); r.events.forEach(e => { if (e.side === 0 && e.delta[1].crit) sum += e.delta[1].damage; }); } return sum; };
  assert.ok(dmg('hardCrit') > dmg('thorns'));
  const evasive = { hp: 30, attack: 20, defense: 10, speed: 20, critical: 0, lifesteal: 0, evasion: 20, armorPierce: 0 };
  const r = w.ForgeBattle.simulate(makeTeam(w, 'a', [{ stats: evasive }, { stats: evasive }, { stats: evasive }]), makeTeam(w, 'b', [{}, {}, {}]), seeded(5));
  assert.ok(r.events.some(e => e.delta[0].dodge > 0), 'dodges are reported per side');
});
