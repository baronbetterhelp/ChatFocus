const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {
  user:null, settings:null, chats:[], currentChat:null, messages:[], pending:[], generating:false,
  controller:null, authMode:"login", view:"chat", web:localStorage.getItem("chatfocus-web")==="true", intelligence:localStorage.getItem("chatfocus-intelligence")==="true", theme:localStorage.getItem("chatfocus-theme")||"system",
  recognition:null, dictating:false, speechUtterance:null, speakingMessageId:null, chatCache:new Map(), projects:[], library:[], schedules:[], activeProject:null, streamRenderFrame:0, chatCreatePromise:null, adminSettings:null, adminRules:[]
};

const els = {
  authView:$("#authView"),appView:$("#appView"),authForm:$("#authForm"),authName:$("#authName"),authEmail:$("#authEmail"),authPassword:$("#authPassword"),nameField:$("#nameField"),authTitle:$("#authTitle"),authSubtitle:$("#authSubtitle"),authSubmit:$("#authSubmit"),authSwitch:$("#authSwitch"),
  sidebar:$("#sidebar"),sidebarBackdrop:$("#sidebarBackdrop"),pinnedChatList:$("#pinnedChatList"),recentChatList:$("#recentChatList"),pinnedSection:$("#pinnedSection"),chatSearch:$("#chatSearch"),currentChatTitle:$("#currentChatTitle"),messageList:$("#messageList"),messagesScroller:$("#messagesScroller"),composer:$("#composer"),fileInput:$("#fileInput"),cameraInput:$("#cameraInput"),photoInput:$("#photoInput"),attachMenu:$("#attachMenu"),attachMenuBtn:$("#attachMenuBtn"),attachmentTray:$("#attachmentTray"),sendBtn:$("#sendBtn"),stopBtn:$("#stopBtn"),webToggle:$("#webToggle"),adminNav:$("#adminNav"),chatView:$("#chatView"),libraryView:$("#libraryView"),projectsView:$("#projectsView"),scheduledView:$("#scheduledView"),adminView:$("#adminView"),accountPanel:$("#accountPanel")
};

boot();

async function boot(){
  applyTheme(); bindEvents();
  const res=await fetch("/api/me",{credentials:"include",cache:"no-store"});
  if(res.ok){ const data=await res.json(); state.user=data.user; state.settings=data.settings; await enterApp(); }
  else showAuth();
}

function bindEvents(){
  els.authForm.addEventListener("submit",onAuthSubmit);
  els.authSwitch.addEventListener("click",toggleAuthMode);
  $("#togglePassword").addEventListener("click",()=>{els.authPassword.type=els.authPassword.type==="password"?"text":"password"});
  $("#newChatBtn").addEventListener("click",()=>newChat(true));
  $("#brandHome").addEventListener("click",()=>{switchView("chat"); closeSidebar();});
  $("#refreshChats").addEventListener("click",()=>loadChats());
  $("#openSidebar").addEventListener("click",openSidebar); $("#closeSidebar").addEventListener("click",closeSidebar); els.sidebarBackdrop.addEventListener("click",closeSidebar);
  els.chatSearch.addEventListener("input",()=>renderChats(els.chatSearch.value));
  els.sendBtn.addEventListener("click",sendMessage); $("#stopBtn").addEventListener("click",stopGeneration);
  els.composer.addEventListener("input",autoGrow); els.composer.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage();}});
  els.fileInput.addEventListener("change",e=>handleFiles([...e.target.files]));
  els.cameraInput.addEventListener("change",e=>handleFiles([...e.target.files]));
  els.photoInput.addEventListener("change",e=>handleFiles([...e.target.files]));
  els.attachMenuBtn.addEventListener("click",e=>{e.stopPropagation();toggleAttachMenu()});
  els.attachMenu.addEventListener("click",handleAttachMenuAction);
  syncIntelligenceUI(); syncWebUI();
  $("#micBtn").addEventListener("click",toggleDictation);
  $("#intelligenceActiveBtn").addEventListener("click",()=>setIntelligence(false));
  els.webToggle.addEventListener("click",()=>setWebSearch(!state.web));
  $("#renameChatBtn").addEventListener("click",renameCurrentChat); $("#pinChatBtn").addEventListener("click",pinCurrentChat); $("#deleteChatBtn").addEventListener("click",deleteCurrentChat);
  $("#accountBtn").addEventListener("click",openAccountPanel);
  $("#closeAccountPanel").addEventListener("click",closeAccountPanel);
  $("#logoutBtn").addEventListener("click",logout);
  $("#themeToggle").addEventListener("click",()=>openSettingsDetail("appearance"));
  $("#memoryToggleMenu").addEventListener("click",()=>openSettingsDetail("memory"));
  $("#settingsSearch").addEventListener("input",filterSettings);
  $("#dictationSettings").addEventListener("click",()=>openSettingsDetail("dictation"));
  $("#languageSettings").addEventListener("click",()=>openSettingsDetail("language"));
  $("#savedChatsInfo").addEventListener("click",()=>openSettingsDetail("conversations"));
  $("#storageInfo").addEventListener("click",()=>openSettingsDetail("storage"));
  $("#modelInfo").addEventListener("click",()=>openSettingsDetail("model"));
  $("#privacyInfo").addEventListener("click",()=>openSettingsDetail("privacy"));
  $(".settings-profile-card").addEventListener("click",()=>openSettingsDetail("profile"));
  els.accountPanel.addEventListener("click",e=>{if(e.target===els.accountPanel)closeAccountPanel()});
  $("#accountAdminBtn").addEventListener("click",()=>{closeAccountPanel();switchView("admin")});
  $("#adminNav").addEventListener("click",()=>switchView("admin"));
  $("#libraryNav").addEventListener("click",()=>switchView("library"));
  $("#projectsNav").addEventListener("click",()=>switchView("projects"));
  $("#scheduledNav").addEventListener("click",()=>switchView("scheduled"));
  $("#librarySearch").addEventListener("input",debounce(()=>loadLibrary($("#librarySearch").value),160));
  $("#newProjectBtn").addEventListener("click",()=>toggleProjectCreate(true));
  $("#cancelProjectBtn").addEventListener("click",()=>toggleProjectCreate(false));
  $("#createProjectBtn").addEventListener("click",createProject);
  $("#projectNameInput").addEventListener("keydown",e=>{if(e.key==="Enter")createProject()});
  $("#newScheduleBtn").addEventListener("click",()=>toggleScheduleForm(true));
  $("#cancelScheduleBtn").addEventListener("click",()=>toggleScheduleForm(false));
  $("#saveScheduleBtn").addEventListener("click",createSchedule);
  $("#adminRefresh").addEventListener("click",loadAdmin); $("#adminUserSearch").addEventListener("input",debounce(loadAdminUsers,180));
  $$("[data-admin-tab]").forEach(b=>b.addEventListener("click",()=>switchAdminTab(b.dataset.adminTab)));
  $("#saveAdminLimits").addEventListener("click",saveAdminLimits);
  $("#saveAdminProduct").addEventListener("click",saveAdminProduct);
  $("#saveAdminRulesSettings").addEventListener("click",saveAdminRulesSettings);
  $("#addAdminRule").addEventListener("click",createAdminRule);
  $$(".suggestion").forEach(b=>b.addEventListener("click",()=>{els.composer.value=b.dataset.prompt||"";autoGrow();els.composer.focus();}));
  $("#confirmCancel").addEventListener("click",()=>closeConfirm(false));
  document.addEventListener("click",e=>{if(!e.target.closest(".chat-row")&&!e.target.closest(".chat-menu"))closeChatMenus();if(!e.target.closest(".attach-menu-wrap"))closeAttachMenu();if(!e.target.closest(".assistant-actions")&&!e.target.closest(".assistant-inline-menu"))closeAssistantActionMenus();});
  window.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();newChat(true)} if(e.key==="Escape"){if(!els.attachMenu.classList.contains("hidden"))closeAttachMenu();else if($("#settingsDetail")&&!$("#settingsDetail").classList.contains("hidden"))closeSettingsDetail();else if(!els.accountPanel.classList.contains("hidden"))closeAccountPanel();else closeSidebar()}});
  ["dragenter","dragover"].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();if(state.user)$("#dropHint").classList.remove("hidden")}));
  ["dragleave","drop"].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();$("#dropHint").classList.add("hidden")}));
  document.addEventListener("drop",e=>{if(e.dataTransfer?.files?.length)handleFiles([...e.dataTransfer.files])});
}

function showAuth(){els.appView.classList.add("hidden");els.authView.classList.remove("hidden")}
function toggleAuthMode(){state.authMode=state.authMode==="login"?"signup":"login";const sign=state.authMode==="signup";els.nameField.classList.toggle("hidden",!sign);els.authName.required=sign;els.authPassword.autocomplete=sign?"new-password":"current-password";els.authTitle.textContent=sign?"Create your account":"Welcome back";els.authSubtitle.textContent=sign?"Your chats, images and files stay connected to your workspace.":"Continue your conversations, files and visual work.";els.authSubmit.querySelector("span").textContent=sign?"Create account":"Sign in";els.authSwitch.textContent=sign?"Already have an account? Sign in":"New to ChatFocus? Create an account"}
async function onAuthSubmit(e){e.preventDefault();const body={email:els.authEmail.value,password:els.authPassword.value,...(state.authMode==="signup"?{name:els.authName.value}:{})};setButtonBusy(els.authSubmit,true);const r=await api(`/api/auth/${state.authMode}`,{method:"POST",body});setButtonBusy(els.authSubmit,false);if(!r.ok)return toast(r.error||"Unable to continue","error");state.user=r.user;const me=await api("/api/me");state.settings=me.settings;await enterApp()}
async function enterApp(){els.authView.classList.add("hidden");els.appView.classList.remove("hidden");const initial=(state.user.name||"C").trim()[0].toUpperCase();$("#accountName").textContent=state.user.name;$("#accountEmail").textContent=state.user.email;$("#avatar").textContent=initial;$("#accountNameLarge").textContent=state.user.name;$("#accountEmailLarge").textContent=state.user.email;$("#accountAvatarLarge").textContent=initial;syncAccountLabels();if(state.user.role==="admin"){els.adminNav.classList.remove("hidden");$("#accountAdminSection").classList.remove("hidden")}if(state.settings?.web_search_enabled){els.webToggle.classList.remove("hidden");syncWebUI()}else{setWebSearch(false,{silent:true,persist:false});els.webToggle.classList.add("hidden")}await loadChats();if(state.chats.length)await openChat(state.chats[0].id);else await newChat(false)}

async function api(url,{method="GET",body,headers}={}){try{const opts={method,credentials:"include",cache:"no-store",headers:{...(body instanceof FormData?{}:{"content-type":"application/json"}),...(headers||{})}};if(body!==undefined)opts.body=body instanceof FormData?body:JSON.stringify(body);const r=await fetch(url,opts);const ct=r.headers.get("content-type")||"";const data=ct.includes("application/json")?await r.json():{text:await r.text()};return {ok:r.ok,status:r.status,...data}}catch(e){return{ok:false,error:e.message||"Network error"}}}

async function loadChats(){
  const r=await api("/api/chats"); if(!r.ok)return;
  state.chats=r.chats||[]; renderChats(els.chatSearch.value);
  populateScheduleChatOptions();
}
function renderChats(query=""){
  const q=String(query||"").trim().toLowerCase();
  const visible=q?state.chats.filter(c=>(c.title||"").toLowerCase().includes(q)):state.chats;
  const pinned=visible.filter(c=>c.pinned), recent=visible.filter(c=>!c.pinned);
  els.pinnedSection.classList.toggle("hidden",!pinned.length);
  els.pinnedChatList.innerHTML=""; els.recentChatList.innerHTML="";
  for(const c of pinned) els.pinnedChatList.appendChild(makeChatRow(c,true));
  for(const c of recent) els.recentChatList.appendChild(makeChatRow(c,false));
  if(!visible.length) els.recentChatList.innerHTML='<div class="empty-sidebar">No conversations found.</div>';
}
function makeChatRow(c,pinned=false){
  const row=document.createElement("div"); row.className=`chat-row ${state.currentChat?.id===c.id?"active":""}`; row.dataset.id=c.id;
  row.innerHTML=`<button class="chat-open">${pinned?'<span class="chat-pin">◆</span>':""}${escapeHtml(c.title)}</button><button class="chat-more" aria-label="Conversation options">•••</button>`;
  const open=row.querySelector(".chat-open"); open.onclick=()=>openChat(c.id); open.onpointerenter=()=>prefetchChat(c.id); open.onpointerdown=()=>prefetchChat(c.id);
  row.querySelector(".chat-more").onclick=e=>{e.stopPropagation();showChatMenu(row,c)};
  return row;
}
async function prefetchChat(id){
  if(state.chatCache.has(id))return;
  const r=await api(`/api/chats/${id}`); if(r.ok)state.chatCache.set(id,{chat:r.chat,messages:r.messages||[],at:Date.now()});
}
function closeChatMenus(){document.querySelectorAll(".chat-menu-layer").forEach(x=>x.remove());document.querySelectorAll(".chat-menu").forEach(x=>x.remove())}
function showChatMenu(row,c){
  closeChatMenus();
  const anchor=row.querySelector(".chat-more");
  const layer=document.createElement("div"); layer.className="chat-menu-layer";
  const menu=document.createElement("div"); menu.className="chat-menu";
  menu.innerHTML=`<button data-a="rename"><span>Rename</span></button><button data-a="pin"><span>${c.pinned?"Unpin":"Pin"}</span></button><button data-a="project"><span>Move to project</span></button><button data-a="delete" class="danger-text"><span>Delete</span></button>`;
  layer.appendChild(menu); document.body.appendChild(layer);
  const r=anchor.getBoundingClientRect(), width=Math.min(228,window.innerWidth-24);
  menu.style.width=width+"px";
  requestAnimationFrame(()=>{const h=menu.offsetHeight||210;const left=Math.max(12,Math.min(window.innerWidth-width-12,r.right-width));let top=r.bottom+7;if(top+h>window.innerHeight-12)top=Math.max(12,r.top-h-7);menu.style.left=left+"px";menu.style.top=top+"px"});
  layer.addEventListener("pointerdown",e=>{if(e.target===layer)closeChatMenus()});
  menu.onclick=async e=>{const b=e.target.closest("[data-a]");if(!b)return;const a=b.dataset.a;closeChatMenus();if(a==="rename")await renameChat(c);if(a==="pin")await pinChat(c);if(a==="project")await moveChatToProject(c);if(a==="delete")await deleteChat(c)};
}
async function newChat(focus=true,projectId=null){
  if(state.generating)return toast("Stop the current response first.");
  // Make the UI react immediately. The network-created chat is resolved in the background.
  const previous={chat:state.currentChat,messages:state.messages,pending:state.pending};
  state.currentChat={id:null,title:"New chat",pinned:0,auto_title:1,project_id:projectId||null,_pending:true};
  state.messages=[]; state.pending=[]; renderAttachments(); renderMessages(); setWorkspaceHeading("New chat","CFocus 1.0");
  switchView("chat"); closeSidebar(); requestAnimationFrame(()=>{if(focus)els.composer.focus()});
  const create=api("/api/chats",{method:"POST",body:{...(projectId?{project_id:projectId}:{})}});
  state.chatCreatePromise=create;
  const r=await create;
  if(state.chatCreatePromise===create)state.chatCreatePromise=null;
  if(!r.ok){state.currentChat=previous.chat;state.messages=previous.messages;state.pending=previous.pending;renderAttachments();renderMessages();if(previous.chat)setWorkspaceHeading(previous.chat.title,"CFocus 1.0");toast(r.error||"Could not start a new chat","error");return null}
  // Only replace the temporary chat if the user is still on it.
  if(state.currentChat?._pending){state.currentChat=r.chat;state.chatCache.set(r.chat.id,{chat:r.chat,messages:[],at:Date.now()});}
  if(!state.chats.some(c=>c.id===r.chat.id)){state.chats.unshift(r.chat);renderChats(els.chatSearch.value)}
  return r.chat;
}
async function ensureCurrentChatReady(){
  if(state.currentChat?.id)return state.currentChat;
  if(state.chatCreatePromise){const r=await state.chatCreatePromise;if(r?.ok){state.currentChat=r.chat;return r.chat}}
  return await newChat(false);
}
function applyChatData(chat,messages){
  state.currentChat=chat; state.messages=messages||[]; state.pending=[]; renderAttachments(); renderMessages(); els.currentChatTitle.textContent=chat.title; renderChats(els.chatSearch.value); switchView("chat"); closeSidebar(); scrollBottom(false)
}
async function openChat(id){
  if(state.generating){toast("Stop the current response before switching chats.");return}
  const cached=state.chatCache.get(id); if(cached)applyChatData(cached.chat,cached.messages);
  const r=await api(`/api/chats/${id}`); if(!r.ok){if(!cached)toast(r.error||"Could not open chat","error");return}
  state.chatCache.set(id,{chat:r.chat,messages:r.messages||[],at:Date.now()}); applyChatData(r.chat,r.messages||[]); maybeRetitleExistingChat(r.chat,r.messages||[])
}
async function maybeRetitleExistingChat(chat,messages){const generic=/^(new chat|hello|hi|hey|question|conversation|file analysis)$/i.test((chat.title||"").trim());if(!chat.auto_title||!generic||(messages||[]).length<2)return;const r=await api(`/api/chats/${chat.id}/retitle`,{method:"POST",body:{}});if(r.ok&&r.chat){const i=state.chats.findIndex(c=>c.id===chat.id);if(i>=0)state.chats[i]={...state.chats[i],...r.chat};if(state.currentChat?.id===chat.id){state.currentChat={...state.currentChat,...r.chat};els.currentChatTitle.textContent=r.chat.title}renderChats(els.chatSearch.value)}}

function renderMessages(){if(!state.messages.length){els.messageList.innerHTML="";return}els.messageList.innerHTML="";for(const m of state.messages){const node=document.createElement("article");node.className=`message message-${m.role}`;node.dataset.id=m.id;if(m.role==="user"){node.innerHTML=`<div class="message-files">${renderFileChips(m.attachments||[])}</div><div class="bubble">${escapeHtml(m.content||"")}</div><div class="message-actions user-actions"><button class="message-action" data-action="copy">Copy</button><button class="message-action" data-action="edit">Edit & resend</button></div>`}else{const timing=formatResponseTime(m.response_time_ms);const actionHidden=m.status==="streaming"?" hidden":"";node.innerHTML=`<div class="assistant-icon"><span class="brand-mark"><i></i><b></b><span></span></span></div><div><div class="assistant-body">${m.status==="streaming"&&!m.content?typingHtml():renderMarkdown(m.content||"")}</div><div class="assistant-actions${actionHidden}"><div class="assistant-action-top"><div class="assistant-action-row"><button class="assistant-icon-action" data-action="copy" title="Copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><rect x="5" y="5" width="10" height="10" rx="2"></rect></svg></button><button class="assistant-icon-action ${state.speakingMessageId===m.id?"active":""}" data-action="speak" title="Read aloud"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5z"></path><path d="M16 9.5a4.5 4.5 0 0 1 0 5"></path><path d="M18.5 7a8 8 0 0 1 0 10"></path></svg></button><button class="assistant-icon-action" data-action="share" title="Share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4"></path><path d="M7 9l5-5 5 5"></path><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"></path></svg></button><button class="assistant-icon-action" data-action="more" title="More"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="18" cy="12" r="1.6"></circle></svg></button>${m.web_search_used?'<span class="assistant-source-pill">Web</span>':''}</div>${timing?`<span class="response-time-chip" title="Response time">${timing}</span>`:''}</div><div class="assistant-inline-menu hidden"><button class="assistant-menu-item" data-action="regen">Regenerate</button><button class="assistant-menu-item" data-action="copy">Copy text</button></div></div></div>`}node.querySelectorAll("[data-action]").forEach(b=>b.onclick=e=>{e.stopPropagation();handleMessageAction(b.dataset.action,m,b)});els.messageList.appendChild(node);wireCodeCopy(node)}}
function renderFileChips(atts){return (atts||[]).map(a=>{const url=`/api/files/${encodeURIComponent(a.id)}`;if((a.mime_type||"").startsWith("image/"))return `<a class="file-chip" href="${url}" target="_blank"><img src="${url}" alt=""><span>${escapeHtml(a.filename)}</span></a>`;return `<a class="file-chip" href="${url}" target="_blank"><span class="file-icon">▤</span><span>${escapeHtml(a.filename)}</span></a>`}).join("")}
function typingHtml(){return '<div class="typing"><i></i><i></i><i></i></div>'}
function handleMessageAction(action,m,trigger){if(action==="copy")return copyText(m.content||"");if(action==="edit")return beginEdit(m);if(action==="regen"){closeAssistantActionMenus();return regenerate(m.parent_message_id)}if(action==="speak")return toggleSpeakMessage(m,trigger);if(action==="share")return shareMessage(m);if(action==="more")return toggleAssistantActionMenu(trigger)}
function beginEdit(m){if(state.generating)return;const node=document.querySelector(`.message[data-id="${CSS.escape(m.id)}"]`);const bubble=node?.querySelector(".bubble");if(!bubble)return;const old=m.content||"";bubble.innerHTML=`<textarea class="edit-area" style="width:min(560px,70vw);min-height:110px;background:transparent;border:0;outline:none;resize:vertical;line-height:1.5">${escapeHtml(old)}</textarea><div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px"><button class="message-action cancel-edit">Cancel</button><button class="primary-btn save-edit" style="padding:7px 11px;font-size:11px">Save & resend</button></div>`;const ta=bubble.querySelector("textarea");ta.focus();bubble.querySelector(".cancel-edit").onclick=renderMessages;bubble.querySelector(".save-edit").onclick=async()=>{const content=ta.value.trim();if(!content)return;const r=await api(`/api/messages/${m.id}`,{method:"PATCH",body:{content}});if(!r.ok)return toast(r.error,"error");await streamRegenerate(m.id)}}
async function regenerate(userMessageId){if(!userMessageId){const prev=[...state.messages].reverse().find(x=>x.role==="user");userMessageId=prev?.id}if(userMessageId)await streamRegenerate(userMessageId)}
async function streamRegenerate(userMessageId){if(!state.currentChat||state.generating)return;const idx=state.messages.findIndex(x=>x.id===userMessageId);if(idx>=0)state.messages=state.messages.slice(0,idx+1);state.messages.push({id:"temp-assistant",role:"assistant",content:"",status:"streaming",parent_message_id:userMessageId,attachments:[]});renderMessages();scrollBottom();await runStream(`/api/chats/${state.currentChat.id}/regenerate`,{user_message_id:userMessageId,web_search:state.web,intelligence:state.intelligence})}
function closeAssistantActionMenus(){ $$(".assistant-inline-menu").forEach(menu=>menu.classList.add("hidden")); }
function toggleAssistantActionMenu(trigger){ const wrap=trigger.closest(".assistant-actions"); if(!wrap)return; const menu=wrap.querySelector(".assistant-inline-menu"); const willOpen=menu.classList.contains("hidden"); closeAssistantActionMenus(); menu.classList.toggle("hidden",!willOpen); }
function toggleSpeakMessage(m,trigger){ if(!window.speechSynthesis){ return toast("Read aloud is not supported on this browser.","error") } if(state.speakingMessageId===m.id){ window.speechSynthesis.cancel(); state.speakingMessageId=null; state.speechUtterance=null; renderMessages(); return } window.speechSynthesis.cancel(); const utter=new SpeechSynthesisUtterance(stripHtml(renderMarkdown(m.content||"")).replace(/↗/g,"").trim()); utter.rate=.98; utter.pitch=1; utter.onend=()=>{ state.speakingMessageId=null; state.speechUtterance=null; renderMessages(); }; utter.onerror=()=>{ state.speakingMessageId=null; state.speechUtterance=null; renderMessages(); toast("Could not play audio.","error") }; state.speakingMessageId=m.id; state.speechUtterance=utter; renderMessages(); window.speechSynthesis.speak(utter); }
async function shareMessage(m){ const text=(m.content||"").trim(); if(!text)return; try{ if(navigator.share){ await navigator.share({text,title:state.currentChat?.title||"ChatFocus"}); toast("Shared") } else { await navigator.clipboard.writeText(text); toast("Copied for sharing") } }catch(e){ if(e?.name!=="AbortError") toast("Could not share","error") } }
function stripHtml(html){ const div=document.createElement("div"); div.innerHTML=html||""; return div.textContent||div.innerText||""; }

async function sendMessage(){if(state.generating)return;const content=els.composer.value.trim();const ready=state.pending.filter(x=>x.status==="ready");const uploading=state.pending.some(x=>x.status==="uploading");if(uploading)return toast("A file is still uploading.");if(!content&&!ready.length)return;const chat=await ensureCurrentChatReady();if(!chat?.id)return;const optimistic={id:`temp-user-${Date.now()}`,role:"user",content,attachments:ready.map(x=>({id:x.id,filename:x.filename,mime_type:x.mime_type,size_bytes:x.size_bytes}))};state.messages.push(optimistic,{id:"temp-assistant",role:"assistant",content:"",status:"streaming",attachments:[]});els.composer.value="";autoGrow();renderMessages();scrollBottom();const ids=ready.map(x=>x.id);state.pending=[];renderAttachments();await runStream(`/api/chats/${chat.id}/messages`,{content,attachment_ids:ids,web_search:state.web,intelligence:state.intelligence})}
async function runStream(url,body){state.generating=true;els.sendBtn.classList.add("hidden");els.stopBtn.classList.remove("hidden");state.controller=new AbortController();let assistant=state.messages[state.messages.length-1];try{const r=await fetch(url,{method:"POST",credentials:"include",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:state.controller.signal});if(!r.ok){const e=await r.json().catch(()=>({error:"Generation failed"}));throw new Error(e.error||"Generation failed")}const reader=r.body.getReader(),decoder=new TextDecoder();let buf="";while(true){const {done,value}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});const lines=buf.split("\n");buf=lines.pop()||"";for(const line of lines){if(!line.trim())continue;let evt;try{evt=JSON.parse(line)}catch{continue}if(evt.type==="start"){assistant.id=evt.message_id}else if(evt.type==="delta"){assistant.content=(assistant.content||"")+evt.delta;assistant.status="streaming";updateStreamingAssistant(assistant,false)}else if(evt.type==="error"){toast(evt.error||"Generation error","error")}else if(evt.type==="done"){assistant.status="complete";assistant.response_time_ms=Number(evt.response_time_ms||0)||null;updateStreamingAssistant(assistant,true)}}}if(buf.trim()){try{const evt=JSON.parse(buf);if(evt.type==="done"){assistant.status="complete";assistant.response_time_ms=Number(evt.response_time_ms||0)||null;updateStreamingAssistant(assistant,true)}}catch{}}}catch(e){if(e.name!=="AbortError")toast(e.message||"Generation failed","error")}finally{state.generating=false;state.controller=null;els.sendBtn.classList.remove("hidden");els.stopBtn.classList.add("hidden");if(state.streamRenderFrame){cancelAnimationFrame(state.streamRenderFrame);state.streamRenderFrame=0}if(assistant?.content)updateStreamingAssistant(assistant,true);const id=state.currentChat?.id;if(id)await syncCurrentChatSilently(id);await loadChats();if(id){setTimeout(()=>refreshSmartTitle(id),900);setTimeout(()=>refreshSmartTitle(id),2400)}}}
function renderStreamingAssistantNow(m,final=false){const messageNode=document.querySelector('.message-assistant:last-child');const bodyNode=messageNode?.querySelector('.assistant-body');if(!messageNode||!bodyNode)return;bodyNode.innerHTML=m.content?renderMarkdown(m.content):typingHtml();wireCodeCopy(messageNode);const actions=messageNode.querySelector('.assistant-actions');if(actions)actions.classList.toggle('hidden',!final&&m.status==='streaming');const chip=messageNode.querySelector('.response-time-chip');const timing=formatResponseTime(m.response_time_ms);if(final&&timing){if(chip)chip.textContent=timing;else{const top=messageNode.querySelector('.assistant-action-top');if(top)top.insertAdjacentHTML('beforeend',`<span class="response-time-chip" title="Response time">${timing}</span>`)}}scrollBottom(false)}
function updateStreamingAssistant(m,final=false){if(final){if(state.streamRenderFrame){cancelAnimationFrame(state.streamRenderFrame);state.streamRenderFrame=0}renderStreamingAssistantNow(m,true);return}if(state.streamRenderFrame)return;state.streamRenderFrame=requestAnimationFrame(()=>{state.streamRenderFrame=0;renderStreamingAssistantNow(m,false)})}
async function syncCurrentChatSilently(id){const r=await api(`/api/chats/${id}`);if(!r.ok)return;state.chatCache.set(id,{chat:r.chat,messages:r.messages||[],at:Date.now()});if(state.currentChat?.id!==id)return;state.currentChat=r.chat;state.messages=r.messages||state.messages;els.currentChatTitle.textContent=r.chat.title}

async function refreshSmartTitle(chatId){const r=await api(`/api/chats/${chatId}/meta`);if(!r.ok||!r.chat)return;const i=state.chats.findIndex(c=>c.id===chatId);if(i>=0)state.chats[i]={...state.chats[i],...r.chat};if(state.currentChat?.id===chatId){state.currentChat={...state.currentChat,...r.chat};els.currentChatTitle.textContent=r.chat.title}const cached=state.chatCache.get(chatId);if(cached)cached.chat={...cached.chat,...r.chat};renderChats(els.chatSearch.value)}
function stopGeneration(){state.controller?.abort();state.generating=false;els.sendBtn.classList.remove("hidden");els.stopBtn.classList.add("hidden")}

async function handleFiles(files){
  if(!files.length)return;
  const chat=await ensureCurrentChatReady(); if(!chat?.id)return;
  const selected=[...files];
  const temps=selected.map(file=>({tempId:crypto.randomUUID(),file,filename:file.name,mime_type:file.type||mimeFromName(file.name),size_bytes:file.size,status:(file.type||"").startsWith("image/")?"optimizing":"uploading",localUrl:(file.type||"").startsWith("image/")?URL.createObjectURL(file):null}));
  state.pending.push(...temps); renderAttachments();
  const batchSize=window.matchMedia("(max-width: 820px)").matches?4:6;
  for(let i=0;i<temps.length;i+=batchSize){
    const batch=temps.slice(i,i+batchSize);
    // Match the low-cost CallFocus pipeline: optimize images one at a time so iPhone/Safari
    // never decodes a large set of full-resolution photos in memory at once.
    for(const temp of batch){
      if((temp.file.type||"").startsWith("image/") && temp.file.type!=="image/gif"){
        try{
          const optimized=await optimizeImageForVision(temp.file,1600,.82);
          if(optimized){
            temp.uploadFile=optimized;
            temp.uploadFilename=optimized.name;
            temp.mime_type=optimized.type||temp.mime_type;
            temp.size_bytes=optimized.size;
          }
        }catch(err){console.warn("Image optimization skipped",temp.filename,err)}
      }
      temp.status="uploading";renderAttachments();
    }
    const fd=new FormData(); fd.append("chat_id",chat.id);
    for(const temp of batch){ const sendFile=temp.uploadFile||temp.file; fd.append("file",sendFile,temp.uploadFilename||temp.filename); fd.append("client_id",temp.tempId); }
    let r=await api("/api/uploads/batch",{method:"POST",body:fd});
    if(r.status===401){
      const me=await api("/api/me");
      if(me.ok) r=await api("/api/uploads/batch",{method:"POST",body:fd});
    }
    if(r.status===401){
      for(const temp of batch){temp.status="error";temp.error="Your session needs to be refreshed. Please sign in again."}
      renderAttachments(); toast("Your ChatFocus session expired. Please sign in again.","error"); break;
    }
    if(!r.ok || !Array.isArray(r.results)){
      for(const temp of batch){temp.status="error";temp.error=r.error||"Upload failed"}
      renderAttachments(); if(r.error)toast(r.error,"error"); continue;
    }
    const byId=new Map(r.results.map(x=>[x.client_id,x]));
    for(const temp of batch){
      const result=byId.get(temp.tempId);
      if(result?.ok&&result.attachment){Object.assign(temp,result.attachment,{status:"ready"})}
      else{temp.status="error";temp.error=result?.error||"Upload failed";toast(`${temp.filename}: ${temp.error}`,"error")}
      delete temp.file;delete temp.uploadFile;
    }
    renderAttachments();
  }
  els.fileInput.value="";els.cameraInput.value="";els.photoInput.value="";
}

async function optimizeImageForVision(file,maxEdge=1600,quality=.82){
  if(!file||!(file.type||"").startsWith("image/")||file.type==="image/gif")return file;
  let bitmap=null,img=null,url=null,width=0,height=0,drawSource=null;
  try{
    if("createImageBitmap" in window){
      bitmap=await createImageBitmap(file);width=bitmap.width;height=bitmap.height;drawSource=bitmap;
    }else{
      url=URL.createObjectURL(file);img=new Image();img.decoding="async";await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});width=img.naturalWidth;height=img.naturalHeight;drawSource=img;
    }
    if(!width||!height)return file;
    const scale=Math.min(1,maxEdge/Math.max(width,height));
    const targetW=Math.max(1,Math.round(width*scale)),targetH=Math.max(1,Math.round(height*scale));
    // If it is already modest in dimensions and storage size, keep the original bytes.
    if(scale===1&&file.size<=3*1024*1024)return file;
    const canvas=document.createElement("canvas");canvas.width=targetW;canvas.height=targetH;
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)return file;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,targetW,targetH);ctx.drawImage(drawSource,0,0,targetW,targetH);
    let blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
    if(!blob)return file;
    // If a small original became larger, keep the original. Large images stay resized because
    // dimensions, not just file bytes, drive vision token usage.
    if(scale===1&&blob.size>=file.size)return file;
    const stem=(file.name||"image").replace(/\.[^.]+$/,'');
    return new File([blob],`${stem}.jpg`,{type:"image/jpeg",lastModified:file.lastModified||Date.now()});
  }finally{
    try{bitmap?.close?.()}catch{}
    if(url)URL.revokeObjectURL(url);
    if(img)img.src="";
  }
}
function renderAttachments(){els.attachmentTray.innerHTML=state.pending.map((a,i)=>`<div class="pending-attachment">${a.localUrl?`<img src="${a.localUrl}" alt="">`:`<div class="pending-icon">▤</div>`}<div class="pending-copy"><strong>${escapeHtml(a.filename)}</strong><small>${a.status==="optimizing"?"Optimizing image…":a.status==="uploading"?"Uploading…":a.status==="ready"?formatBytes(a.size_bytes):(a.error||"Upload failed")}</small></div><button data-remove="${i}">×</button></div>`).join("");els.attachmentTray.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.remove);const a=state.pending[i];if(a?.localUrl)URL.revokeObjectURL(a.localUrl);state.pending.splice(i,1);renderAttachments()})}
function mimeFromName(name){const e=name.split(".").pop().toLowerCase();if(e==="pdf")return"application/pdf";if(e==="csv")return"text/csv";if(["txt","md"].includes(e))return"text/plain";return"application/octet-stream"}

async function renameCurrentChat(){if(state.currentChat)renameChat(state.currentChat)}
async function renameChat(c){const title=prompt("Rename this chat",c.title);if(title===null||!title.trim())return;const r=await api(`/api/chats/${c.id}`,{method:"PATCH",body:{title:title.trim()}});if(!r.ok)return toast(r.error,"error");if(state.currentChat?.id===c.id){state.currentChat=r.chat;els.currentChatTitle.textContent=r.chat.title}await loadChats()}
async function pinCurrentChat(){if(state.currentChat)pinChat(state.currentChat)}
async function pinChat(c){const r=await api(`/api/chats/${c.id}`,{method:"PATCH",body:{pinned:!c.pinned}});if(!r.ok)return toast(r.error,"error");if(state.currentChat?.id===c.id)state.currentChat=r.chat;await loadChats()}
async function deleteCurrentChat(){if(state.currentChat)deleteChat(state.currentChat)}
async function deleteChat(c){const ok=await confirmBox("Delete chat?",`“${c.title}” and its uploaded files will be permanently deleted.`);if(!ok)return;const r=await api(`/api/chats/${c.id}`,{method:"DELETE"});if(!r.ok)return toast(r.error,"error");state.chatCache.delete(c.id);if(state.currentChat?.id===c.id){state.currentChat=null;state.messages=[]}await loadChats();if(!state.currentChat){if(state.chats.length)await openChat(state.chats[0].id);else await newChat(false)}}

function setWorkspaceHeading(title,subtitle=""){$("#currentChatTitle").textContent=title;$("#modelLabel").textContent=subtitle;$("#modelLabel").classList.toggle("hidden",!subtitle)}
function switchView(view){
  closeAccountPanel();state.view=view;
  const map={chat:els.chatView,library:els.libraryView,projects:els.projectsView,scheduled:els.scheduledView,admin:els.adminView};
  Object.entries(map).forEach(([k,el])=>el?.classList.toggle("hidden",k!==view));
  $$('.hub-item').forEach(x=>x.classList.toggle("active",x.dataset.view===view));
  $(".topbar-actions")?.classList.toggle("hidden",view!=="chat");
  if(view==="projects"){ $("#projectDetail")?.classList.add("hidden"); $("#projectsGrid")?.classList.remove("hidden"); state.activeProject=null; }
  if(view==="chat"){setWorkspaceHeading(state.currentChat?.title||"New chat","CFocus 1.0")}
  if(view==="library"){setWorkspaceHeading("Library","");loadLibrary()}
  if(view==="projects"){setWorkspaceHeading("Projects","");loadProjects()}
  if(view==="scheduled"){setWorkspaceHeading("Scheduled","");loadSchedules()}
  if(view==="admin"){setWorkspaceHeading("Admin Console","");loadAdmin()}
  closeSidebar()
}

async function loadLibrary(q=""){
  const r=await api(`/api/library${q?`?q=${encodeURIComponent(q)}`:""}`);if(!r.ok)return toast(r.error||"Could not load library","error");state.library=r.files||[];renderLibrary()
}
function renderLibrary(){
  const grid=$("#libraryGrid"); if(!grid)return;
  if(!state.library.length){grid.innerHTML='<div class="feature-empty"><strong>Your library is empty</strong><span>Images, PDFs and documents you use in chats will appear here.</span></div>';return}
  grid.innerHTML=state.library.map(f=>{const image=(f.mime_type||"").startsWith("image/");return `<button class="library-card" data-file="${f.id}">${image?`<img src="/api/files/${encodeURIComponent(f.id)}" alt="">`:`<span class="library-file-icon">${fileGlyph(f.mime_type,f.filename)}</span>`}<span class="library-card-copy"><strong>${escapeHtml(f.filename)}</strong><small>${escapeHtml(f.chat_title||"Conversation")} · ${formatBytes(f.size_bytes)}</small><em>${formatDate(f.created_at)}</em></span></button>`}).join("");
  grid.querySelectorAll("[data-file]").forEach(b=>b.onclick=()=>window.open(`/api/files/${encodeURIComponent(b.dataset.file)}`,"_blank","noopener"))
}
function fileGlyph(mime,name){const n=(name||"").toLowerCase();if(mime==="application/pdf"||n.endsWith(".pdf"))return"PDF";if(n.match(/\.(doc|docx|odt|rtf)$/))return"DOC";if(n.match(/\.(xls|xlsx|csv|tsv)$/))return"XLS";if(n.match(/\.(ppt|pptx)$/))return"PPT";return"FILE"}

async function loadProjects(){const r=await api("/api/projects");if(!r.ok)return toast(r.error||"Could not load projects","error");state.projects=r.projects||[];renderProjects()}
function renderProjects(){
  const grid=$("#projectsGrid");if(!grid)return;
  if(!state.projects.length){grid.innerHTML='<div class="feature-empty"><strong>No projects yet</strong><span>Create a project to keep related conversations together.</span></div>';return}
  grid.innerHTML=state.projects.map(p=>`<button class="project-card" data-project="${p.id}"><span class="project-folder"><svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg></span><span><strong>${escapeHtml(p.name)}</strong><small>${Number(p.chat_count||0)} conversation${Number(p.chat_count||0)===1?"":"s"}</small></span><i>›</i></button>`).join("");
  grid.querySelectorAll("[data-project]").forEach(b=>b.onclick=()=>openProject(b.dataset.project))
}
function toggleProjectCreate(show){$("#projectCreateBar").classList.toggle("hidden",!show);if(show){$("#projectNameInput").value="";setTimeout(()=>$("#projectNameInput").focus(),20)}}
async function createProject(){const name=$("#projectNameInput").value.trim();if(!name)return toast("Enter a project name.","error");const r=await api("/api/projects",{method:"POST",body:{name}});if(!r.ok)return toast(r.error,"error");toggleProjectCreate(false);await loadProjects();toast("Project created")}
async function openProject(id){
  const r=await api(`/api/projects/${id}`);if(!r.ok)return toast(r.error,"error");state.activeProject=r.project;
  const detail=$("#projectDetail");detail.classList.remove("hidden");$("#projectsGrid").classList.add("hidden");
  detail.innerHTML=`<div class="project-detail-head"><button class="icon-btn project-back" aria-label="Back">←</button><div><h2>${escapeHtml(r.project.name)}</h2><p>${(r.chats||[]).length} conversations</p></div><button class="primary-btn compact-primary project-new-chat">New chat</button></div><div class="project-chat-list">${(r.chats||[]).length?(r.chats||[]).map(c=>`<button data-project-chat="${c.id}"><span>${escapeHtml(c.title)}</span><small>${formatDate(c.updated_at)}</small><i>›</i></button>`).join(""):'<div class="feature-empty"><strong>No conversations yet</strong><span>Start a chat inside this project.</span></div>'}</div><div class="project-detail-actions"><button class="secondary-btn project-rename">Rename</button><button class="danger-btn project-delete">Delete project</button></div>`;
  detail.querySelector(".project-back").onclick=()=>{detail.classList.add("hidden");$("#projectsGrid").classList.remove("hidden");state.activeProject=null};
  detail.querySelector(".project-new-chat").onclick=()=>newChat(true,id);
  detail.querySelectorAll("[data-project-chat]").forEach(b=>b.onclick=()=>openChat(b.dataset.projectChat));
  detail.querySelector(".project-rename").onclick=async()=>{const name=prompt("Rename project",r.project.name);if(!name?.trim())return;const x=await api(`/api/projects/${id}`,{method:"PATCH",body:{name:name.trim()}});if(!x.ok)return toast(x.error,"error");await loadProjects();await openProject(id)};
  detail.querySelector(".project-delete").onclick=async()=>{const ok=await confirmBox("Delete project?","The project will be removed. Its conversations will stay in ChatFocus.");if(!ok)return;const x=await api(`/api/projects/${id}`,{method:"DELETE"});if(!x.ok)return toast(x.error,"error");detail.classList.add("hidden");$("#projectsGrid").classList.remove("hidden");state.activeProject=null;await loadProjects();await loadChats()}
}
async function moveChatToProject(c){
  if(!state.projects.length)await loadProjects();
  if(!state.projects.length){switchView("projects");toggleProjectCreate(true);return toast("Create a project first.")}
  const options=state.projects.map((p,i)=>`${i+1}. ${p.name}`).join("\n");const answer=prompt(`Move “${c.title}” to a project:\n0. No project\n${options}`);if(answer===null)return;
  const n=Number(answer);let projectId=null;if(n>0&&state.projects[n-1])projectId=state.projects[n-1].id;else if(n!==0)return toast("Choose a valid project number.","error");
  const r=await api(`/api/chats/${c.id}`,{method:"PATCH",body:{project_id:projectId}});if(!r.ok)return toast(r.error,"error");toast(projectId?"Moved to project":"Removed from project");await loadChats();if(state.view==="projects")await loadProjects()
}

function toggleScheduleForm(show){$("#scheduleForm").classList.toggle("hidden",!show);if(show){populateScheduleChatOptions();const d=new Date(Date.now()+60*60*1000);d.setMinutes(Math.ceil(d.getMinutes()/15)*15,0,0);$("#scheduleRunAt").value=toLocalInputValue(d);setTimeout(()=>$("#schedulePrompt").focus(),20)}}
function populateScheduleChatOptions(){const sel=$("#scheduleChatSelect");if(!sel)return;const current=sel.value;sel.innerHTML='<option value="">Create a new conversation</option>'+state.chats.slice(0,100).map(c=>`<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("");if([...sel.options].some(o=>o.value===current))sel.value=current}
async function createSchedule(){const promptText=$("#schedulePrompt").value.trim(),run=$("#scheduleRunAt").value,frequency=$("#scheduleFrequency").value,chat_id=$("#scheduleChatSelect").value||null;if(!promptText||!run)return toast("Add a prompt and time.","error");const r=await api("/api/schedules",{method:"POST",body:{prompt:promptText,run_at:new Date(run).toISOString(),frequency,chat_id}});if(!r.ok)return toast(r.error,"error");$("#schedulePrompt").value="";toggleScheduleForm(false);await loadSchedules();await loadChats();toast("Scheduled")}
async function loadSchedules(){const r=await api("/api/schedules");if(!r.ok)return toast(r.error||"Could not load schedules","error");state.schedules=r.schedules||[];renderSchedules()}
function renderSchedules(){const list=$("#scheduleList");if(!list)return;if(!state.schedules.length){list.innerHTML='<div class="feature-empty"><strong>Nothing scheduled</strong><span>Create a prompt to run later, daily, or weekly.</span></div>';return}list.innerHTML=state.schedules.map(t=>`<article class="schedule-card ${t.enabled?"":"disabled"}"><div class="schedule-time"><strong>${formatDateTime(t.next_run_at)}</strong><span>${t.frequency==="once"?"One time":t.frequency[0].toUpperCase()+t.frequency.slice(1)}</span></div><div class="schedule-copy"><strong>${escapeHtml(t.prompt)}</strong><small>${escapeHtml(t.chat_title||"Scheduled conversation")}${t.last_error?` · Last run had an error`:""}</small></div><div class="schedule-card-actions"><button data-toggle-schedule="${t.id}" data-enabled="${t.enabled}">${t.enabled?"Pause":"Resume"}</button><button data-open-schedule-chat="${t.chat_id}">Open chat</button><button data-delete-schedule="${t.id}" class="danger-text">Delete</button></div></article>`).join("");list.querySelectorAll("[data-toggle-schedule]").forEach(b=>b.onclick=async()=>{const r=await api(`/api/schedules/${b.dataset.toggleSchedule}`,{method:"PATCH",body:{enabled:b.dataset.enabled!=="1"}});if(!r.ok)return toast(r.error,"error");loadSchedules()});list.querySelectorAll("[data-open-schedule-chat]").forEach(b=>b.onclick=()=>openChat(b.dataset.openScheduleChat));list.querySelectorAll("[data-delete-schedule]").forEach(b=>b.onclick=async()=>{const ok=await confirmBox("Delete schedule?","This scheduled prompt will stop running.");if(!ok)return;await api(`/api/schedules/${b.dataset.deleteSchedule}`,{method:"DELETE"});loadSchedules()})}
function toLocalInputValue(d){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16)}
function formatDateTime(v){if(!v)return"—";const d=new Date(String(v).replace(" ","T")+"Z");return Number.isNaN(d.getTime())?v:d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}

async function loadAdmin(){if(state.user?.role!=="admin")return;const [stats,settings,rules]=await Promise.all([api("/api/admin/stats"),api("/api/admin/settings"),api("/api/admin/rules")]);if(stats.ok)renderStats(stats.stats);if(settings.ok)renderAdminSettings(settings);if(rules.ok){state.adminRules=rules.rules||[];renderAdminRules()}await loadAdminUsers()}
function switchAdminTab(tab){const ids={overview:"adminOverviewPanel",customers:"adminCustomersPanel",limits:"adminLimitsPanel",rules:"adminRulesPanel"};$$('[data-admin-tab]').forEach(b=>b.classList.toggle("active",b.dataset.adminTab===tab));Object.entries(ids).forEach(([k,id])=>$("#"+id)?.classList.toggle("hidden",k!==tab));if(tab==="customers")loadAdminUsers();if(tab==="rules")loadAdminRules()}
function renderStats(s){const cards=[['Customers',s.users],['Active today',s.active_today],['AI requests today',s.requests_today],['Tokens today',formatNumber(s.tokens_today||0)],['Images today',s.images_today||0],['Avg response',s.avg_response_ms?`${(s.avg_response_ms/1000).toFixed(2)}s`:'—'],['Suspended',s.suspended]];$("#statsGrid").innerHTML=cards.map(([k,v])=>`<div class="stat-card"><small>${k}</small><strong>${typeof v==="number"?formatNumber(v):v}</strong></div>`).join("")}
async function loadAdminUsers(){if(state.user?.role!=="admin")return;const q=$("#adminUserSearch").value.trim();const r=await api(`/api/admin/users${q?`?q=${encodeURIComponent(q)}`:""}`);if(!r.ok)return toast(r.error||"Could not load customers","error");const users=r.users||[];$("#adminCustomerCount").textContent=`${users.length} shown`;$("#usersTable").innerHTML=users.map(u=>{const override=u.daily_limit_override===null||u.daily_limit_override===undefined?"":Number(u.daily_limit_override);const imageOverride=u.daily_image_limit_override===null||u.daily_image_limit_override===undefined?"":Number(u.daily_image_limit_override);const effective=Number(u.unlimited_usage||0)===1?"Unlimited":(Number(u.effective_daily_limit||0)===0?"Unlimited":formatNumber(Number(u.effective_daily_limit||0)));const imageEffective=Number(u.effective_daily_image_limit||0)===0?"Unlimited":formatNumber(Number(u.effective_daily_image_limit||0));return `<tr><td><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.email)}</small></td><td><strong>${formatNumber(Number(u.requests_today||0))}</strong><small>requests</small></td><td><input class="customer-limit-input" data-limit-user="${u.id}" type="number" min="0" max="100000" value="${override}" placeholder="Global ${r.global_daily_limit||0}" title="Blank uses global limit; 0 means unlimited"></td><td><label class="mini-switch"><input data-unlimited-user="${u.id}" type="checkbox" ${Number(u.unlimited_usage||0)===1?"checked":""}><span></span></label></td><td><strong>${formatNumber(Number(u.images_today||0))}</strong><small>images</small></td><td><input class="customer-limit-input" data-image-limit-user="${u.id}" type="number" min="0" max="100000" value="${imageOverride}" placeholder="Global ${r.global_daily_image_limit||0}" title="Blank uses global image limit; 0 means unlimited"></td><td><span class="pill ${u.status==="active"?"good":"bad"}">${u.status}</span></td><td><span class="pill">${u.role}</span></td><td><strong>${effective} AI · ${imageEffective} images</strong><small>${formatNumber(Number(u.total_tokens||0))} tokens · ${formatNumber(Number(u.chat_count||0))} chats</small></td><td><div class="customer-actions"><button class="table-action" data-user="${u.id}" data-status="${u.status}">${u.status==="active"?"Suspend":"Activate"}</button><button class="table-action" data-role-user="${u.id}" data-role="${u.role}">${u.role==="admin"?"Make user":"Make admin"}</button></div></td></tr>`}).join("");const table=$("#usersTable");table.querySelectorAll("[data-user]").forEach(b=>b.onclick=()=>adminPatchUser(b.dataset.user,{status:b.dataset.status==="active"?"suspended":"active"}));table.querySelectorAll("[data-role-user]").forEach(b=>b.onclick=()=>adminPatchUser(b.dataset.roleUser,{role:b.dataset.role==="admin"?"user":"admin"}));table.querySelectorAll("[data-unlimited-user]").forEach(c=>c.onchange=()=>adminPatchUser(c.dataset.unlimitedUser,{unlimited_usage:c.checked},{quiet:true}));table.querySelectorAll("[data-limit-user]").forEach(inp=>inp.onchange=()=>adminPatchUser(inp.dataset.limitUser,{daily_limit_override:inp.value===""?null:Number(inp.value)},{quiet:true}));table.querySelectorAll("[data-image-limit-user]").forEach(inp=>inp.onchange=()=>adminPatchUser(inp.dataset.imageLimitUser,{daily_image_limit_override:inp.value===""?null:Number(inp.value)},{quiet:true}))}
async function adminPatchUser(id,body,opts={}){const r=await api(`/api/admin/users/${id}`,{method:"PATCH",body});if(!r.ok)return toast(r.error,"error");if(!opts.quiet)toast("Customer updated");await loadAdminUsers()}
function renderAdminSettings(d){const s=d.settings||{};state.adminSettings=s;$("#adminModel").value=d.model||"gpt-6-luna";$("#adminSystemPrompt").value=s.system_prompt||"";$("#adminServiceEnabled").checked=s.service_enabled!=="false";$("#adminDailyLimit").value=s.daily_request_limit??100;$("#adminImageUploadsEnabled").checked=s.image_uploads_enabled!=="false";$("#adminDailyImageLimit").value=s.daily_image_upload_limit??20;$("#adminMaxImageMb").value=s.max_image_upload_mb??d.max_upload_mb??18;$("#adminSignups").checked=s.signups_enabled!=="false";$("#adminMemory").checked=s.memory_enabled!=="false";$("#adminWeb").checked=s.web_search_enabled==="true";$("#adminImageDetail").value=s.image_detail||"low";$("#adminPins").value=s.max_pins||5;$("#adminOwnerRules").checked=s.owner_rules_enabled!=="false";$("#adminOpenMode").checked=s.open_response_mode!=="false";$("#adminServiceStatus").textContent=s.service_enabled==="false"?"Paused":"Online";$("#adminServiceStatus").classList.toggle("danger-text",s.service_enabled==="false");const n=Number(s.daily_request_limit||0);$("#adminDefaultLimitSummary").textContent=n===0?"Unlimited":`${formatNumber(n)} requests`;const images=Number(s.daily_image_upload_limit||0);$("#adminImageLimitSummary").textContent=s.image_uploads_enabled==="false"?"Disabled":(images===0?"Unlimited":`${formatNumber(images)} images`);$("#adminRuntimeSummary").textContent="CFocus 1.0";$("#adminReleaseSummary").textContent=`ChatFocus ${d.release||"V1.17"} · ${d.model||"gpt-6-luna"}`}
async function saveAdminSettingsPart(body,message="Settings saved"){const r=await api("/api/admin/settings",{method:"PUT",body});if(!r.ok)return toast(r.error,"error");renderAdminSettings(r);toast(message);const me=await api("/api/me");if(me.ok){state.settings=me.settings;els.webToggle.classList.toggle("hidden",!state.settings.web_search_enabled)}return r}
async function saveAdminLimits(){await saveAdminSettingsPart({service_enabled:$("#adminServiceEnabled").checked,daily_request_limit:Number($("#adminDailyLimit").value||0),image_uploads_enabled:$("#adminImageUploadsEnabled").checked,daily_image_upload_limit:Number($("#adminDailyImageLimit").value||0),max_image_upload_mb:Number($("#adminMaxImageMb").value||18),signups_enabled:$("#adminSignups").checked,memory_enabled:$("#adminMemory").checked,web_search_enabled:$("#adminWeb").checked},"Limits & access saved");await loadAdminUsers()}
async function saveAdminProduct(){await saveAdminSettingsPart({image_detail:$("#adminImageDetail").value,max_pins:Number($("#adminPins").value||5)},"Product defaults saved")}
async function saveAdminRulesSettings(){await saveAdminSettingsPart({system_prompt:$("#adminSystemPrompt").value,owner_rules_enabled:$("#adminOwnerRules").checked,open_response_mode:$("#adminOpenMode").checked},"Behavior settings saved")}
async function loadAdminRules(){if(state.user?.role!=="admin")return;const r=await api("/api/admin/rules");if(!r.ok)return toast(r.error||"Could not load rules","error");state.adminRules=r.rules||[];renderAdminRules()}
function renderAdminRules(){const list=$("#adminRulesList");if(!list)return;if(!state.adminRules.length){list.innerHTML='<div class="feature-empty admin-rule-empty"><strong>No custom service rules yet</strong><span>Add a rule above when you want ChatFocus to restrict or shape a particular service.</span></div>';return}list.innerHTML=state.adminRules.map(r=>`<article class="admin-rule-card" data-rule-id="${r.id}"><div class="admin-rule-top"><input class="admin-rule-title" value="${escapeHtml(r.title)}"><label class="mini-switch"><input class="admin-rule-enabled" type="checkbox" ${Number(r.enabled)===1?"checked":""}><span></span></label></div><textarea class="admin-rule-text" rows="4">${escapeHtml(r.rule_text)}</textarea><div class="admin-rule-actions"><button class="secondary-btn compact-rule-save">Save rule</button><button class="table-action danger-text compact-rule-delete">Delete</button></div></article>`).join("");list.querySelectorAll(".admin-rule-card").forEach(card=>{const id=card.dataset.ruleId;card.querySelector(".admin-rule-enabled").onchange=e=>patchAdminRule(id,{enabled:e.target.checked},{quiet:true});card.querySelector(".compact-rule-save").onclick=()=>patchAdminRule(id,{title:card.querySelector(".admin-rule-title").value,rule_text:card.querySelector(".admin-rule-text").value});card.querySelector(".compact-rule-delete").onclick=()=>deleteAdminRule(id)})}
async function createAdminRule(){const title=$("#adminRuleTitle").value.trim(),rule_text=$("#adminRuleText").value.trim();if(!title||!rule_text)return toast("Add a rule name and description.","error");const r=await api("/api/admin/rules",{method:"POST",body:{title,rule_text,enabled:true}});if(!r.ok)return toast(r.error,"error");$("#adminRuleTitle").value="";$("#adminRuleText").value="";toast("Rule added");await loadAdminRules()}
async function patchAdminRule(id,body,opts={}){const r=await api(`/api/admin/rules/${id}`,{method:"PATCH",body});if(!r.ok)return toast(r.error,"error");if(!opts.quiet)toast("Rule saved");await loadAdminRules()}
async function deleteAdminRule(id){const ok=await confirmBox("Delete service rule?","This custom rule will stop applying to ChatFocus immediately.");if(!ok)return;const r=await api(`/api/admin/rules/${id}`,{method:"DELETE"});if(!r.ok)return toast(r.error,"error");toast("Rule deleted");await loadAdminRules()}

async function logout(){await api("/api/auth/logout",{method:"POST",body:{}});location.reload()}
async function toggleMyMemory(){const enabled=!state.user.memory_enabled;const r=await api("/api/me/memory",{method:"PATCH",body:{enabled}});if(!r.ok)return toast(r.error,"error");state.user.memory_enabled=enabled;syncAccountLabels();toast(`Memory turned ${enabled?"on":"off"}`)}
function setTheme(theme){if(!["system","dark","light"].includes(theme))return;state.theme=theme;localStorage.setItem("chatfocus-theme",state.theme);applyTheme();syncAccountLabels();renderSettingsDetailIfOpen()}
function cycleTheme(){const seq=["system","dark","light"];setTheme(seq[(seq.indexOf(state.theme)+1)%seq.length])}
function syncAccountLabels(){const mem=$("#memoryStateLabel"),theme=$("#themeStateLabel");if(mem)mem.textContent=state.user?.memory_enabled?"On":"Off";if(theme)theme.textContent=state.theme.charAt(0).toUpperCase()+state.theme.slice(1)}
function applyTheme(){let t=state.theme;if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}
function openAccountPanel(){closeSidebar();syncAccountLabels();ensureSettingsDetail();closeSettingsDetail();const q=$("#settingsSearch");if(q){q.value="";filterSettings()}els.accountPanel.classList.remove("hidden")}function closeAccountPanel(){closeSettingsDetail();els.accountPanel.classList.add("hidden")}
function ensureSettingsDetail(){if($("#settingsDetail"))return;const shell=els.accountPanel.querySelector(".account-panel-shell");const detail=document.createElement("section");detail.id="settingsDetail";detail.className="settings-detail hidden";detail.innerHTML=`<header class="settings-detail-header"><button id="settingsDetailBack" class="settings-detail-back" aria-label="Back">‹</button><strong id="settingsDetailTitle">Settings</strong><span></span></header><div id="settingsDetailBody" class="settings-detail-body"></div>`;shell.appendChild(detail);$("#settingsDetailBack").addEventListener("click",closeSettingsDetail);$("#settingsDetailBody").addEventListener("click",handleSettingsDetailAction)}
function closeSettingsDetail(){const d=$("#settingsDetail");if(d)d.classList.add("hidden")}
function openSettingsDetail(kind){ensureSettingsDetail();const d=$("#settingsDetail");d.dataset.kind=kind;renderSettingsDetail(kind);d.classList.remove("hidden")}
function renderSettingsDetailIfOpen(){const d=$("#settingsDetail");if(d&&!d.classList.contains("hidden"))renderSettingsDetail(d.dataset.kind)}
function settingsDetailCard(title,body){return `<div class="settings-detail-card"><h3>${title}</h3>${body}</div>`}
function renderSettingsDetail(kind){const title=$("#settingsDetailTitle"),body=$("#settingsDetailBody");if(!title||!body)return;const supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition);const release="V1.14";const selected=t=>state.theme===t?" selected":"";const on=!!state.user?.memory_enabled;const map={
profile:["Account",settingsDetailCard("Profile",`<div class="settings-account-hero"><span class="avatar account-avatar-large">${escapeHtml((state.user?.name||"C")[0]?.toUpperCase()||"C")}</span><div><strong>${escapeHtml(state.user?.name||"Account")}</strong><small>${escapeHtml(state.user?.email||"")}</small></div></div><div class="settings-kv"><span>Role</span><b>${escapeHtml(state.user?.role||"user")}</b></div><div class="settings-kv"><span>Account status</span><b>Active</b></div>`)],
appearance:["Appearance",settingsDetailCard("Choose a theme",`<button class="settings-choice${selected("system")}" data-setting-theme="system"><span>System</span><b>${state.theme==="system"?"✓":""}</b></button><button class="settings-choice${selected("light")}" data-setting-theme="light"><span>Light</span><b>${state.theme==="light"?"✓":""}</b></button><button class="settings-choice${selected("dark")}" data-setting-theme="dark"><span>Dark</span><b>${state.theme==="dark"?"✓":""}</b></button>`)],
memory:["Memory",settingsDetailCard("Use past conversations",`<p class="settings-detail-text">When Memory is on, ChatFocus can use compact context from earlier conversations to make future replies more relevant.</p><button class="settings-switch-row" data-memory-detail-toggle><span><strong>Memory</strong><small>${on?"Currently on":"Currently off"}</small></span><i class="ui-switch ${on?"on":""}"><u></u></i></button>`)],
dictation:["Dictation",settingsDetailCard("Microphone dictation",`<p class="settings-detail-text">Turn speech into text directly in the message composer.</p><div class="settings-kv"><span>Browser support</span><b>${supported?"Available":"Unavailable"}</b></div><button class="settings-detail-action" data-settings-action="dictation">${supported?"Use microphone in chat":"Back to chat"}</button>`)],
language:["App Language",settingsDetailCard("Interface language",`<button class="settings-choice selected"><span>English</span><b>✓</b></button><p class="settings-detail-note">Additional interface languages can be added in a future release.</p>`)],
conversations:["Saved Conversations",settingsDetailCard("Conversation history",`<div class="settings-kv"><span>Saved chats</span><b>${state.chats.length}</b></div><p class="settings-detail-text">Your conversations stay connected to this account until you delete them.</p><button class="settings-detail-action" data-settings-action="conversations">View conversations</button>`)],
storage:["File Storage",settingsDetailCard("Private uploads",`<p class="settings-detail-text">Images, PDFs and documents uploaded to ChatFocus are kept in your private file storage and associated with your account.</p><div class="settings-kv"><span>Storage</span><b>Private</b></div><button class="settings-detail-action" data-settings-action="library">Open Library</button>`)],
model:["ChatFocus Model",settingsDetailCard("CFocus 1.0",`<div class="model-badge">CFocus 1.0</div><div class="settings-kv"><span>ChatFocus release</span><b>${release}</b></div><div class="settings-kv"><span>Intelligence</span><b>${state.intelligence?"On":"Off"}</b></div><div class="settings-kv"><span>Web Search</span><b>${state.web?"On":"Off"}</b></div>`)],
privacy:["Privacy & Security",settingsDetailCard("Your data",`<div class="privacy-point"><strong>Private uploads</strong><small>Your stored files are not published as public R2 URLs.</small></div><div class="privacy-point"><strong>Server-side AI access</strong><small>Your OpenAI API credential stays on the Cloudflare Worker, not in the browser.</small></div><div class="privacy-point"><strong>Account sessions</strong><small>Sign out any time to end this browser session.</small></div>`)]};const [t,h]=map[kind]||map.profile;title.textContent=t;body.innerHTML=h}
async function handleSettingsDetailAction(e){const theme=e.target.closest("[data-setting-theme]");if(theme){setTheme(theme.dataset.settingTheme);return}if(e.target.closest("[data-memory-detail-toggle]")){await toggleMyMemory();renderSettingsDetail("memory");return}const a=e.target.closest("[data-settings-action]")?.dataset.settingsAction;if(a==="dictation"){closeAccountPanel();setTimeout(()=>{els.composer.focus();toggleDictation()},80)}if(a==="conversations"){closeAccountPanel();switchView("chat");openSidebar()}if(a==="library"){closeAccountPanel();switchView("library")}}
function filterSettings(){const input=$("#settingsSearch");if(!input)return;const q=input.value.trim().toLowerCase();$$('[data-settings-search]').forEach(el=>{const hay=(el.dataset.settingsSearch||"").toLowerCase();el.classList.toggle("settings-filtered",!!q&&!hay.includes(q))});$$('[data-settings-section]').forEach(group=>{const visible=[...group.querySelectorAll('[data-settings-search]')].some(el=>!el.classList.contains("settings-filtered"));group.classList.toggle("settings-empty",!visible);const title=group.previousElementSibling;if(title?.classList.contains("settings-section-title"))title.classList.toggle("settings-empty",!visible)});const admin=$("#accountAdminSection");if(admin&&!admin.classList.contains("hidden")){const group=admin.querySelector('[data-settings-section]');const visible=group&&![...group.querySelectorAll('[data-settings-search]')].every(el=>el.classList.contains("settings-filtered"));admin.classList.toggle("settings-search-empty",!visible)}}
function openSidebar(){els.sidebar.classList.add("open");els.sidebarBackdrop.classList.add("show")}function closeSidebar(){els.sidebar.classList.remove("open");els.sidebarBackdrop.classList.remove("show")}

function toggleAttachMenu(force){const shouldOpen=force===undefined?els.attachMenu.classList.contains("hidden"):!!force;els.attachMenu.classList.toggle("hidden",!shouldOpen);els.attachMenuBtn.setAttribute("aria-expanded",String(shouldOpen));if(shouldOpen)syncIntelligenceUI()}
function closeAttachMenu(){els.attachMenu.classList.add("hidden");els.attachMenuBtn.setAttribute("aria-expanded","false")}
function handleAttachMenuAction(e){const btn=e.target.closest("[data-attach-action]");if(!btn)return;const action=btn.dataset.attachAction;if((action==="camera"||action==="photos")&&state.settings?.image_uploads_enabled===false&&state.user?.role!=="admin"){closeAttachMenu();return toast("Image uploads are currently disabled by the administrator.","error")}if(action==="camera"){closeAttachMenu();els.cameraInput.click();return}if(action==="photos"){closeAttachMenu();els.photoInput.click();return}if(action==="files"){closeAttachMenu();els.fileInput.click();return}if(action==="intelligence"){setIntelligence(!state.intelligence);closeAttachMenu();toast(`Intelligence ${state.intelligence?"on":"off"}`)}}
function setIntelligence(on){state.intelligence=!!on;localStorage.setItem("chatfocus-intelligence",String(state.intelligence));syncIntelligenceUI();document.documentElement.dataset.intelligence=state.intelligence?"on":"off"}
function setWebSearch(on,{silent=false,persist=true}={}){state.web=!!on;if(persist)localStorage.setItem("chatfocus-web",String(state.web));syncWebUI();if(!silent)toast(`Web search ${state.web?"on":"off"}`)}
function syncWebUI(){const btn=els.webToggle;if(!btn)return;document.documentElement.dataset.web=state.web?"on":"off";btn.classList.toggle("active",state.web);btn.setAttribute("aria-pressed",String(state.web));btn.setAttribute("aria-label",state.web?"Web search on. Tap to turn it off.":"Turn on web search");btn.title=state.web?"Web search is on":"Use live web search";const label=btn.querySelector("span:last-child");if(label)label.textContent="Web"}
function syncIntelligenceUI(){const btn=$("#intelligenceToggle"),label=$("#intelligenceState"),active=$("#intelligenceActiveBtn");document.documentElement.dataset.intelligence=state.intelligence?"on":"off";if(!btn||!label)return;btn.classList.toggle("active",state.intelligence);btn.setAttribute("aria-checked",String(state.intelligence));label.textContent=state.intelligence?"On":"Off";els.attachMenuBtn.classList.toggle("intelligence-on",state.intelligence);if(active){active.classList.toggle("hidden",!state.intelligence);active.setAttribute("aria-pressed",String(state.intelligence))}}

function setDictationUI(on){state.dictating=!!on;const btn=$("#micBtn");if(!btn)return;btn.classList.toggle("listening",state.dictating);btn.setAttribute("aria-pressed",String(state.dictating));btn.setAttribute("aria-label",state.dictating?"Stop dictation":"Start dictation");btn.title=state.dictating?"Stop dictation":"Dictate"}
function toggleDictation(){if(state.dictating&&state.recognition){state.recognition.stop();return}const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){els.composer.focus();return toast("Microphone dictation is not supported by this browser. You can still use your keyboard microphone.","error")}const rec=new R();state.recognition=rec;rec.lang=navigator.language||"en-US";rec.interimResults=true;rec.continuous=true;const base=els.composer.value.trimEnd();rec.onstart=()=>setDictationUI(true);rec.onresult=e=>{let text="";for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;els.composer.value=(base+(base?" ":"")+text).trimStart();autoGrow();els.composer.focus()};rec.onerror=e=>{if(e.error!=="aborted"&&e.error!=="no-speech")toast("Dictation stopped. Please try again.","error")};rec.onend=()=>{state.recognition=null;setDictationUI(false)};try{rec.start()}catch{state.recognition=null;setDictationUI(false);toast("Could not start the microphone.","error")}}
function autoGrow(){els.composer.style.height="auto";els.composer.style.height=Math.min(190,els.composer.scrollHeight)+"px"}
function scrollBottom(smooth=true){requestAnimationFrame(()=>els.messagesScroller.scrollTo({top:els.messagesScroller.scrollHeight,behavior:smooth?"smooth":"auto"}))}

function renderMarkdown(raw){if(!raw)return"";const blocks=[],links=[];let text=String(raw).replace(/```([^\n]*)\n?([\s\S]*?)```/g,(_,lang,code)=>{const token=`@@CODE${blocks.length}@@`;blocks.push(`<div class="code-wrap"><div class="code-head"><span>${escapeHtml(lang.trim()||"code")}</span><button class="copy-code">Copy</button></div><pre><code>${escapeHtml(code.replace(/\n$/,""))}</code></pre></div>`);return token});text=text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,(_,label,url)=>{const token=`@@LINK${links.length}@@`;links.push({label,url});return token});text=escapeHtml(text);const lines=text.split("\n");let html="",inUl=false,inOl=false;const close=()=>{if(inUl){html+="</ul>";inUl=false}if(inOl){html+="</ol>";inOl=false}};for(let line of lines){if(/^@@CODE\d+@@$/.test(line.trim())){close();html+=line.trim();continue}if(/^###\s+/.test(line)){close();html+=`<h3>${inlineMd(line.replace(/^###\s+/,""))}</h3>`;continue}if(/^##\s+/.test(line)){close();html+=`<h2>${inlineMd(line.replace(/^##\s+/,""))}</h2>`;continue}if(/^#\s+/.test(line)){close();html+=`<h1>${inlineMd(line.replace(/^#\s+/,""))}</h1>`;continue}if(/^[-*]\s+/.test(line)){if(!inUl){close();html+="<ul>";inUl=true}html+=`<li>${inlineMd(line.replace(/^[-*]\s+/,""))}</li>`;continue}if(/^\d+\.\s+/.test(line)){if(!inOl){close();html+="<ol>";inOl=true}html+=`<li>${inlineMd(line.replace(/^\d+\.\s+/,""))}</li>`;continue}close();if(line.trim())html+=`<p>${inlineMd(line)}</p>`;else html+="<br>"}close();blocks.forEach((b,i)=>html=html.replace(`@@CODE${i}@@`,b));links.forEach((l,i)=>{const href=escapeHtml(cleanLinkUrl(l.url));const label=escapeHtml(l.label);html=html.replaceAll(`@@LINK${i}@@`,`<a class="assistant-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}<span class="external-link-mark" aria-hidden="true">↗</span></a>`)});return html}
function inlineMd(s){return s.replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>")}
function cleanLinkUrl(raw){try{const u=new URL(raw);["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_name"].forEach(k=>u.searchParams.delete(k));return u.toString()}catch{return raw}}
function wireCodeCopy(root){root?.querySelectorAll(".copy-code").forEach(b=>b.onclick=()=>copyText(b.closest(".code-wrap").querySelector("code").textContent))}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast("Copied")}catch{toast("Could not copy","error")}}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
function formatResponseTime(ms){ms=Number(ms||0);if(!Number.isFinite(ms)||ms<=0)return"";const seconds=ms/1000;return `${seconds<10?seconds.toFixed(2):seconds<100?seconds.toFixed(1):Math.round(seconds)}s`}
function formatBytes(n){n=Number(n||0);if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;return`${(n/1048576).toFixed(1)} MB`}
function formatNumber(n){return new Intl.NumberFormat().format(Number(n||0))}
function formatDate(v){if(!v)return"—";const d=new Date(String(v).replace(" ","T")+(/[zZ]|[+-]\d\d:?\d\d$/.test(v)?"":"Z"));return Number.isNaN(d.getTime())?v:d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"2-digit"})}
function setButtonBusy(btn,busy){btn.disabled=busy;btn.style.opacity=busy?.65:1}
function toast(msg,type="ok"){const x=document.createElement("div");x.className=`toast ${type}`;x.textContent=msg;$("#toastHost").appendChild(x);setTimeout(()=>x.remove(),3000)}
function confirmBox(title,text){return new Promise(resolve=>{const modal=$("#confirmModal");$("#confirmTitle").textContent=title;$("#confirmText").textContent=text;modal.classList.remove("hidden");const ok=$("#confirmOk");const finish=v=>{modal.classList.add("hidden");ok.onclick=null;window.__confirmResolve=null;resolve(v)};ok.onclick=()=>finish(true);window.__confirmResolve=finish})}
function closeConfirm(v){window.__confirmResolve?.(v)}
