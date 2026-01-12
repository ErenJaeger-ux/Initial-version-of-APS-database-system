let records = [];
let dicts = { addresses: [], objects: [] };
let selectedId = null;
let pendingData = null;

let sortState = { key: "date", dir: "desc" };

const $ = (id) => document.getElementById(id);

function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowHHMM(){ return new Date().toTimeString().slice(0,5); }

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function mark(v){ return v ? "✓" : ""; }
function norm(s){ return String(s ?? "").toLowerCase(); }

async function apiGet(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(await r.text());
  return await r.json();
}
async function apiSend(path, method, body){
  const r = await fetch(path,{
    method,
    headers: {"Content-Type":"application/json"},
    body: body ? JSON.stringify(body) : undefined
  });
  if(!r.ok){
    try{
      const j = await r.json();
      throw new Error(j.error || "Ошибка");
    }catch(e){
      throw new Error(e.message || "Ошибка");
    }
  }
  return await r.json();
}

function getFormData(){
  return {
    date: $("date").value,
    time: $("time").value,
    key_number: $("keyNumber").value.trim(),
    address: $("address").value.trim(),
    object_name: $("object").value.trim(),
    is_false_alarm: $("isFalseAlarm").checked,
    reimbursement_required: $("reimbursementRequired").checked,
    letter_sent: $("letterSent").checked,
    notes: $("notes").value.trim()
  };
}

function setFormData(r){
  $("date").value = r.date || todayISO();
  $("time").value = r.time || nowHHMM();
  $("keyNumber").value = r.key_number || "";
  $("address").value = r.address || "";
  $("object").value = r.object_name || "";
  $("isFalseAlarm").checked = !!r.is_false_alarm;
  $("reimbursementRequired").checked = !!r.reimbursement_required;
  $("letterSent").checked = !!r.letter_sent;
  $("notes").value = r.notes || "";
}

function clearForm(){
  selectedId = null;
  setFormData({date: todayISO(), time: nowHHMM()});
  render();
}

function applySearchAndSort(list){
  const q = norm($("searchInput").value);
  let arr = list.filter(r=>{
    if(!q) return true;
    return norm(r.address).includes(q) || norm(r.object_name).includes(q) || norm(r.key_number).includes(q);
  });

  const {key, dir} = sortState;
  arr.sort((a,b)=>{
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    if(av < bv) return dir==="asc" ? -1 : 1;
    if(av > bv) return dir==="asc" ? 1 : -1;
    return 0;
  });
  return arr;
}

function renderDicts(){
  const renderList = (arr, id)=>{
    const c = $(id);
    c.innerHTML = "";
    arr.forEach(v=>{
      const d = document.createElement("div");
      d.className = "dict-item";
      d.innerHTML = `<span>${esc(v)}</span>`;
      c.appendChild(d);
    });
  };
  renderList(dicts.addresses || [], "addressList");
  renderList(dicts.objects || [], "objectList");
}

function renderFlat(list){
  const tb = $("tableBody");
  tb.innerHTML = "";
  list.forEach(r=>{
    const tr = document.createElement("tr");
    if(selectedId === r.id) tr.classList.add("selected");
    tr.innerHTML = `
      <td>${esc(r.date)}</td>
      <td>${esc(r.time)}</td>
      <td>${esc(r.key_number || "-")}</td>
      <td>${esc(r.address)}</td>
      <td>${esc(r.object_name)}</td>
      <td>${mark(r.is_false_alarm)}</td>
      <td>${mark(r.reimbursement_required)}</td>
      <td>${mark(r.letter_sent)}</td>
      <td>${esc(r.notes || "")}</td>
    `;
    tr.onclick = ()=>{
      selectedId = r.id;
      setFormData(r);
      render();
    };
    tb.appendChild(tr);
  });
}

function renderGrouped(list){
  const tb = $("tableBody");
  tb.innerHTML = "";

  const groups = new Map();
  list.forEach(r=>{
    const k = r.object_name || "(без объекта)";
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  const keys = Array.from(groups.keys()).sort((a,b)=>a.localeCompare(b,"ru"));
  keys.forEach(k=>{
    const rows = groups.get(k);

    const head = document.createElement("tr");
    head.innerHTML = `<td colspan="9"><strong>${esc(k)}</strong> — ${rows.length} выезд(ов) <span style="opacity:.7">(клик: раскрыть)</span></td>`;
    tb.appendChild(head);

    let open = false;
    const detailRows = [];

    rows.forEach(r=>{
      const tr = document.createElement("tr");
      tr.style.display = "none";
      if(selectedId === r.id) tr.classList.add("selected");
      tr.innerHTML = `
        <td>${esc(r.date)}</td>
        <td>${esc(r.time)}</td>
        <td>${esc(r.key_number || "-")}</td>
        <td>${esc(r.address)}</td>
        <td>${esc(r.object_name)}</td>
        <td>${mark(r.is_false_alarm)}</td>
        <td>${mark(r.reimbursement_required)}</td>
        <td>${mark(r.letter_sent)}</td>
        <td>${esc(r.notes || "")}</td>
      `;
      tr.onclick = (e)=>{
        e.stopPropagation();
        selectedId = r.id;
        setFormData(r);
        render();
      };
      tb.appendChild(tr);
      detailRows.push(tr);
    });

    head.onclick = ()=>{
      open = !open;
      detailRows.forEach(tr=>tr.style.display = open ? "" : "none");
    };
  });
}

function latestYear(){
  if(!records.length) return new Date().getFullYear();
  const max = Math.max(...records.map(r=>Date.parse(r.date)));
  return new Date(max).getFullYear();
}

function runQuarterAnalysis(q){
  const year = latestYear();
  const groups = {};
  records.forEach(r=>{
    const d = new Date(r.date);
    const qq = Math.floor(d.getMonth()/3)+1;
    if(d.getFullYear()!==year || qq!==q) return;
    const name = r.object_name || "(без объекта)";
    if(!groups[name]) groups[name] = {count:0, details:[]};
    groups[name].count++;
    groups[name].details.push(`${r.date.split("-").reverse().join(".")} ${r.time} — ${r.address}`);
  });

  const list = Object.entries(groups).filter(([,v])=>v.count>=3).sort((a,b)=>b[1].count-a[1].count);
  const cont = $("resultsList");
  cont.innerHTML = "";
  if(!list.length){
    cont.innerHTML = "<div>Нет объектов с 3+ выездами за квартал.</div>";
  }else{
    list.forEach(([name, data])=>{
      const item = document.createElement("div");
      item.className = "analysis-item";
      item.innerHTML = `
        <div class="analysis-header"><span>${esc(name)}</span><span>${data.count} выездов ▾</span></div>
        <div class="analysis-details">${data.details.map(d=>`<div>${esc(d)}</div>`).join("")}</div>
      `;
      item.querySelector(".analysis-header").onclick = ()=>{
        const det = item.querySelector(".analysis-details");
        det.style.display = det.style.display==="block" ? "none" : "block";
      };
      cont.appendChild(item);
    });
  }
  $("resultsSection").style.display = "block";
}

function setupAutocomplete(inputId, listId, dataFn){
  const input = $(inputId);
  const list = $(listId);
  input.oninput = ()=>{
    const v = norm(input.value);
    list.innerHTML = "";
    if(!v){ list.style.display="none"; return; }
    const matches = dataFn().filter(x=>norm(x).includes(v)).slice(0,30);
    matches.forEach(m=>{
      const d = document.createElement("div");
      d.className = "autocomplete-item";
      d.textContent = m;
      d.onclick = ()=>{ input.value = m; list.style.display="none"; };
      list.appendChild(d);
    });
    list.style.display = matches.length ? "block" : "none";
  };
  input.onblur = ()=>setTimeout(()=>list.style.display="none",150);
}

function setupSorting(){
  document.querySelectorAll("th[data-sort]").forEach(th=>{
    th.onclick = ()=>{
      const key = th.dataset.sort;
      if(sortState.key===key) sortState.dir = sortState.dir==="asc" ? "desc" : "asc";
      else { sortState.key = key; sortState.dir = "asc"; }
      render();
    };
  });
}

function render(){
  $("recordCount").textContent = String(records.length);
  const filtered = applySearchAndSort(records);
  if($("groupToggle").checked) renderGrouped(filtered);
  else renderFlat(filtered);
  renderDicts();
}

async function reloadAll(){
  dicts = await apiGet("/api/dicts");
  records = await apiGet("/api/records");
  render();
}

window.addEventListener("load", async ()=>{
  $("date").value = todayISO();
  $("time").value = nowHHMM();

  $("dictionaryToggle").onclick = ()=>{
    const c = $("dictionaryContent");
    c.classList.toggle("expanded");
    $("toggleIcon").textContent = c.classList.contains("expanded") ? "−" : "+";
  };

  $("searchInput").oninput = render;
  $("groupToggle").onchange = render;
  $("clearBtn").onclick = clearForm;

  $("addBtn").onclick = async ()=>{
    const data = getFormData();
    if(!data.date || !data.time || !data.address || !data.object_name) return alert("Заполните обязательные поля: дата, время, адрес, объект.");
    if(!data.key_number){
      pendingData = data;
      $("keyCheckModal").style.display = "flex";
      return;
    }
    try{
      await apiSend("/api/records","POST",data);
      await reloadAll();
      clearForm();
    }catch(e){ alert(e.message); }
  };

  $("confirmWithoutKeyBtn").onclick = async ()=>{
    try{
      await apiSend("/api/records","POST",pendingData);
      pendingData = null;
      $("keyCheckModal").style.display = "none";
      await reloadAll();
      clearForm();
    }catch(e){ alert(e.message); }
  };
  $("cancelWithoutKeyBtn").onclick = ()=>{
    pendingData = null;
    $("keyCheckModal").style.display = "none";
  };

  $("editBtn").onclick = async ()=>{
    if(!selectedId) return alert("Выберите запись в таблице.");
    try{
      await apiSend(`/api/records/${selectedId}`,"PUT",getFormData());
      await reloadAll();
      clearForm();
    }catch(e){ alert(e.message); }
  };

  $("deleteBtn").onclick = async ()=>{
    if(!selectedId) return alert("Выберите запись в таблице.");
    if(!confirm("Удалить запись?")) return;
    try{
      await apiSend(`/api/records/${selectedId}`,"DELETE");
      await reloadAll();
      clearForm();
    }catch(e){ alert(e.message); }
  };

  $("exportBtn").onclick = ()=>{ window.location.href="/api/export"; };

  $("importBtn").onclick = ()=>$("importFile").click();
  $("importFile").onchange = async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const data = JSON.parse(await file.text());
      await apiSend("/api/import","POST",data);
      await reloadAll();
      clearForm();
      alert("Импорт выполнен.");
    }catch(err){ alert("Ошибка импорта: " + (err.message||"")); }
    finally{ $("importFile").value=""; }
  };

  document.querySelectorAll(".btn-quarter").forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".btn-quarter").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      runQuarterAnalysis(parseInt(btn.dataset.quarter,10));
    };
  });

  setupSorting();
  await reloadAll();

  setupAutocomplete("address","addressAutocomplete",()=>dicts.addresses||[]);
  setupAutocomplete("object","objectAutocomplete",()=>dicts.objects||[]);
});
