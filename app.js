const rates = {
  FLA: [1.15, 'PTR'],
  POH: [1.52, 'PETE'],
  DRD: [1.17, 'RV'],
  GMI: [1.12, 'Box'],
  MCA: [1.12, 'MCA'],
  STX: [1.15, 'TOI']
};

const coords = CITY_COORDS;

const sampleText = `FLA
CDL
FORT WAYNE , IN
DECATUR , AL
515
DRD
CDL
DECATUR , IN
PERRY , IA
521
DRD
CDL
DECATUR , IN
WEST CHESTER , PA
580
MCA
CDL
HENDERSON , KY
MADISON , WI
446
MCA
NCDL
INDIANAPOLIS , IN
BERWYN , PA
641`;

let S = JSON.parse(localStorage.LPsettings || '{}');
S = { home:'Louisville, KY', mpg:15, diesel:4.75, hotel:95, meals:35, tax:25, ...S };
let trips = JSON.parse(localStorage.LPtrips3 || '[]');

const money  = n => Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});
const money2 = n => Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});

function saveSettings() {
  S = { home:home.value, mpg:+mpg.value, diesel:+diesel.value, hotel:+hotel.value, meals:+meals.value, tax:+tax.value };
  localStorage.LPsettings = JSON.stringify(S);
}
function saveTrips() { localStorage.LPtrips3 = JSON.stringify(trips); }

function init() {
  home.value=S.home; mpg.value=S.mpg; diesel.value=S.diesel;
  hotel.value=S.hotel; meals.value=S.meals; tax.value=S.tax;
  cTerm.innerHTML = Object.keys(rates).map(x=>`<option>${x}</option>`).join('');
  board.value = sampleText;
  analyze();
  render();
}

function tab(id, b) {
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  b.classList.add('active');
  render();
}

function clean(x) { return x.replace(/\s+,/g,',').replace(/\s+/g,' ').trim(); }
function key(x)   {
  return clean(x).toUpperCase().replace(/[.']/g,'').replace(/^SAINT\s+/,'ST ');
}
function state(x) { let a=x.split(','); return a.length>1?a.pop().trim().toUpperCase():''; }

function haversine(a, b) {
  const R=3958.8, rad=x=>x*Math.PI/180;
  const d1=rad(b[0]-a[0]), d2=rad(b[1]-a[1]);
  const q=Math.sin(d1/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(d2/2)**2;
  return Math.round(2*R*Math.asin(Math.sqrt(q)));
}

function distFromHome(place) {
  const a = coords[key(S.home)] || coords['LOUISVILLE, KY'];
  const b = coords[key(place)];
  if (!b) return null;
  return Math.round(haversine(a, b) * 1.25);
}

function distBetween(placeA, placeB) {
  const a = coords[key(placeA)];
  const b = coords[key(placeB)];
  if (!a || !b) return null;
  return Math.round(haversine(a, b) * 1.25);
}

function parse(raw) {
  let lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean), out=[];
  for (let i=0; i<=lines.length-5; i+=5) {
    let term=lines[i].toUpperCase(), lic=lines[i+1].toUpperCase();
    let orig=clean(lines[i+2]), dest=clean(lines[i+3]), m=+lines[i+4];
    if (!isNaN(m)) out.push({term,lic,orig,dest,miles:m});
  }
  return out;
}

function estimate(x) {
  S.mpg=+mpg.value; S.diesel=+diesel.value;
  S.hotel=+hotel.value; S.meals=+meals.value; S.tax=+tax.value;
  const rev    = x.miles * rates[x.term][0];
  const fuel   = x.miles / S.mpg * S.diesel;
  const days   = Math.max(1, Math.ceil(x.miles/450));
  const hotels = Math.max(0, days-1) * S.hotel;
  const meal   = days * S.meals;
  const dhMiles    = distFromHome(x.orig);
  const homeMiles  = distBetween(x.dest, S.home);
  const dhCost     = (dhMiles   ?? 150) * 0.45;
  const returnCost = (homeMiles ?? 400) * 0.45;
  const chainBonus = ['IN','OH','GA','TX','FL'].includes(state(x.dest)) ? 14 : 0;
  const profit = rev - fuel - hotels - meal - dhCost - returnCost;
  const ppd    = profit / days;
  const score  = Math.max(1, Math.min(100, Math.round(
    50 + (profit/x.miles)*32 + ppd/20 + chainBonus
  )));
  return { rev, fuel, days, hotels, meal, dhCost, dhMiles, returnCost, homeMiles, profit, ppd, score };
}

function analyze() {
  saveSettings();
  const dhLimit = +maxDeadhead.value || 150;
  const all = parse(board.value);
  const unknownTerm = [...new Set(all.filter(x=>!rates[x.term]).map(x=>x.term))];
  const known = all.filter(x => rates[x.term]);
  const seen = new Set();
  const filtered = [], outOfRange = [], unknownLoc = [];
  known.forEach(x => {
    const dh = distFromHome(x.orig);
    if (dh === null) { unknownLoc.push(x); return; }
    if (dh > dhLimit) { outOfRange.push({...x, dh}); return; }
    const k = `${x.term}|${x.orig}|${x.dest}|${x.miles}`;
    if (seen.has(k)) return;
    seen.add(k);
    filtered.push({...x, e: estimate(x), dh});
  });
  filtered.sort((a,b) => b.e.profit - a.e.profit);
  summary.innerHTML = `
    <div class="pill"><span>Matching loads</span><strong>${filtered.length}</strong></div>
    <div class="pill"><span>Best profit</span><strong>${filtered[0] ? money(filtered[0].e.profit) : '—'}</strong></div>
    <div class="pill"><span>Deadhead limit</span><strong>${dhLimit} mi</strong></div>`;
  let skippedParts = [];
  if (unknownTerm.length) skippedParts.push(`Unknown terminals skipped: ${unknownTerm.join(', ')}`);
  const dedupedCount = known.filter(x=>{ const dh=distFromHome(x.orig); return dh!==null && dh<=dhLimit; }).length - filtered.length;
  if (outOfRange.length) skippedParts.push(`${outOfRange.length} load${outOfRange.length>1?'s':''} beyond ${dhLimit} mi deadhead`);
  if (unknownLoc.length) {
    const cities = [...new Set(unknownLoc.map(x=>x.orig))];
    skippedParts.push(`${unknownLoc.length} load${unknownLoc.length>1?'s':''} skipped — origin city not recognized: ${cities.join(', ')}`);
  }
  if (dedupedCount > 0) skippedParts.push(`${dedupedCount} duplicate${dedupedCount>1?'s':''} collapsed`);
  skipped.innerHTML = skippedParts.length
    ? `<div class="skipped-banner">&#8505; ${skippedParts.join(' &bull; ')}</div>` : '';
  if (!filtered.length) {
    results.innerHTML = board.value.trim()
      ? `<div class="card"><p class="note">No loads match within ${dhLimit} miles. Try increasing the deadhead limit.</p></div>`
      : `<div class="card"><p class="note">Paste a load board above to get started.</p></div>`;
    return;
  }
  results.innerHTML = filtered.map(x => {
    const sc = x.e.score>=75?'good':x.e.score>=55?'warn':'bad';
    return `
    <article class="card load ${sc}">
      <div class="top">
        <div>
          <div class="route">${x.orig} &rarr; ${x.dest}</div>
          <p>
            <span class="badge">${x.term}</span>
            <span class="badge">${x.lic}</span>
            <span class="badge">${x.miles} mi loaded</span>
            <span class="badge badge-dh">&#9650; ${x.dh} mi deadhead</span>
          </p>
        </div>
        <div class="score ${sc}-score">${money(x.e.profit)}</div>
      </div>
      <div class="details">
        <div class="box"><span>Revenue</span><strong>${money(x.e.rev)}</strong></div>
        <div class="box"><span>Fuel</span><strong>${money(x.e.fuel)}</strong></div>
        <div class="box"><span>Deadhead</span><strong>${money(x.e.dhCost)}</strong></div>
        <div class="box"><span>Return est.</span><strong>${money(x.e.returnCost)}</strong></div>
        <div class="box"><span>Hotel+meals</span><strong>${money(x.e.hotels+x.e.meal)}</strong></div>
        <div class="box"><span>Profit/day</span><strong>${money(x.e.ppd)}</strong></div>
      </div>
      <ul style="margin-top:8px">
        <li>${rates[x.term][1]} at ${money2(rates[x.term][0])}/mile &bull; ${x.e.days} day${x.e.days>1?'s':''}</li>
        <li>Ask dispatch about fuel level and chaining.</li>
      </ul>
      <div class="actions">
        <button class="btn-secondary btn-sm" onclick='selectLoad(${JSON.stringify(x).replaceAll("'","&#39;")})'>Call dispatch &rarr;</button>
      </div>
    </article>`;
  }).join('');
}

function sample() { board.value = sampleText; analyze(); }

function clearBoard() { board.value = ''; analyze(); }

function selectLoad(x) {
  const e = estimate(x);
  cTerm.value=x.term; cOrig.value=x.orig; cDest.value=x.dest; cMiles.value=x.miles;
  cBonus.value=0; cFuelFree.checked=false; cNoHotel.checked=false;
  cNoMeals.checked=false; cReturnSolved.checked=false;
  cFuel.value=Math.round(e.fuel); cHotel.value=Math.round(e.hotels);
  cMeals.value=Math.round(e.meal); cTolls.value=0;
  cPickup.value=Math.round(e.dhCost); cReturn.value=Math.round(e.returnCost);
  cFuelLevel.value='Unknown'; cChain.value='Unknown'; cAgain.value='Unknown'; cNotes.value='';
  selectedLoad.innerHTML=`
    <div class="route">${x.orig} &rarr; ${x.dest}</div>
    <p><span class="badge">${x.term}</span><span class="badge">${x.lic}</span><span class="badge">${x.miles} mi</span><span class="badge badge-dh">&#9650; ${x.dh} mi deadhead</span></p>`;
  recalcCall();
  tab('call', document.querySelectorAll('.tab')[1]);
}

function recalcCall() {
  S.diesel=+diesel.value; S.hotel=+hotel.value; S.meals=+meals.value;
  S.tax=+tax.value; S.mpg=+mpg.value;
  const term=cTerm.value, m=+cMiles.value||1;
  const rev=m*rates[term][0]+(+cBonus.value||0);
  const fuel=cFuelFree.checked?0:+cFuel.value;
  const hotels=cNoHotel.checked?0:+cHotel.value;
  const meal=cNoMeals.checked?0:+cMeals.value;
  const ret=cReturnSolved.checked?0:+cReturn.value;
  const cost=fuel+hotels+meal+(+cTolls.value)+(+cPickup.value)+ret;
  const profit=rev-cost;
  const days=Math.max(1,Math.ceil(m/450));
  const score=Math.max(1,Math.min(100,Math.round(
    50+(profit/m)*35+(profit/days)/20
    +(cFuelFree.checked?8:0)+(cReturnSolved.checked?10:0)
    +(cChain.value==='Likely'?10:cChain.value==='No'?-8:0)
  )));
  const taxR=Math.max(0,profit*S.tax/100);
  callResult.innerHTML=`
    <div class="pill"><span>Revenue</span><strong>${money(rev)}</strong></div>
    <div class="pill"><span>Costs</span><strong>${money(cost)}</strong></div>
    <div class="pill"><span>Profit</span><strong>${money(profit)}</strong></div>
    <div class="pill"><span>After tax est.</span><strong>${money(profit-taxR)}</strong></div>
    <div class="pill"><span>Score</span><strong>${score}/100</strong></div>
    <div class="pill"><span>Profit/mile</span><strong>${money2(profit/m)}</strong></div>
    <div class="pill"><span>Tax reserve</span><strong>${money(taxR)}</strong></div>`;
  return {term,orig:cOrig.value,dest:cDest.value,miles:m,rev,cost,profit,score,
    fuel,hotels,meals:meal,tolls:+cTolls.value,pickup:+cPickup.value,ret,
    bonus:+cBonus.value,notes:cNotes.value,fuelLevel:cFuelLevel.value,chain:cChain.value,again:cAgain.value};
}

function saveCallTrip() {
  const t=recalcCall(); t.id=Date.now();
  trips.push(t); saveTrips(); render(); alert('Trip saved!');
}

function render() {
  tripList.innerHTML=trips.map(t=>`
    <article class="card">
      <div class="top">
        <div>
          <div class="route">${t.orig} &rarr; ${t.dest}</div>
          <p><span class="badge">${t.term}</span><span class="badge">${t.miles} mi</span><span class="badge">${t.fuelLevel}</span><span class="badge">Chain: ${t.chain}</span></p>
        </div>
        <div class="score">${money(t.profit)}</div>
      </div>
      <div class="details">
        <div class="box"><span>Revenue</span><strong>${money(t.rev)}</strong></div>
        <div class="box"><span>Costs</span><strong>${money(t.cost)}</strong></div>
        <div class="box"><span>Score</span><strong>${t.score}/100</strong></div>
        <div class="box"><span>Again?</span><strong>${t.again}</strong></div>
      </div>
      ${t.notes?`<p class="note" style="margin-top:8px"><b>Notes:</b> ${t.notes}</p>`:''}
      <div class="actions"><button class="btn-danger btn-sm" onclick="delTrip(${t.id})">Delete</button></div>
    </article>`).join('')||'<div class="card"><p class="note">No trips saved yet.</p></div>';
  const rev=trips.reduce((s,t)=>s+t.rev,0);
  const cost=trips.reduce((s,t)=>s+t.cost,0);
  const profit=rev-cost;
  const miles=trips.reduce((s,t)=>s+t.miles,0);
  const taxR=Math.max(0,profit*S.tax/100);
  metrics.innerHTML=`
    <div class="pill"><span>Revenue</span><strong>${money(rev)}</strong></div>
    <div class="pill"><span>Costs</span><strong>${money(cost)}</strong></div>
    <div class="pill"><span>Net profit</span><strong>${money(profit)}</strong></div>
    <div class="pill"><span>After tax est.</span><strong>${money(profit-taxR)}</strong></div>
    <div class="pill"><span>Tax reserve</span><strong>${money(taxR)}</strong></div>
    <div class="pill"><span>Profit/mile</span><strong>${miles?money2(profit/miles):'$0.00'}</strong></div>`;
  const by={};
  trips.forEach(t=>by[t.term]=(by[t.term]||0)+t.profit);
  const entries=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(1,...entries.map(x=>Math.abs(x[1])));
  bars.innerHTML=entries.map(([k,v])=>`
    <div class="barrow"><b>${k}</b>
    <div class="track"><div class="fill" style="width:${Math.max(4,Math.abs(v)/max*100)}%"></div></div>
    <span>${money(v)}</span></div>`).join('')||'<p class="note">No trips yet.</p>';
  best.innerHTML=trips.slice().sort((a,b)=>b.profit-a.profit).slice(0,5).map(t=>`
    <div class="pill">
      <b>${t.term}: ${t.orig} &rarr; ${t.dest}</b>
      <p class="note">${money(t.profit)} profit &bull; take again: ${t.again}</p>
    </div>`).join('')||'<p class="note">No trips yet.</p>';
}

function delTrip(id) {
  if (!confirm('Delete this trip?')) return;
  trips=trips.filter(t=>t.id!==id); saveTrips(); render();
}

init();
