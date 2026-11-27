import {siteThemes,siteAccents,validAccent,applySiteTheme} from './site-theme.js';
import {avatarImage} from './profile-image.js';
import {setupBadgeDetails} from './badges.js';
import {setupAdmin} from './admin.js';
import {menuGames,menuName,libraryGroups,filterGames,gameCard,renderLibrary} from './library.js';
import {route,createNavigation,currentNavigation} from './navigation.js';
import { drawingFor,syncPartyCanvas } from './party-game.js';
import { gameCover } from './game-cover.js';
import { catalog } from './catalog.js';
import { translate } from './locale.js';
import { reactionEmojis } from './match.js';
import {renderRoom} from './room-page.js';
import { setupProfileUI,imageForUpload } from './profile.js';
import {setupReports} from './reports.js';
import { animateMatch } from './motion.js';
import { createSound } from './sound.js';
import { setupVoice } from './voice.js';

const turnOptions = [0,15,30,45,60,90];

const $ = selector => document.querySelector(selector);
const main = $('#main');
const dialog = $('#dialog');
const notice = $('#notice');
const saved = key => localStorage.getItem('saha:' + key);
const save = (key, value) => localStorage.setItem('saha:' + key, value);
let language = saved('lang') === 'en' ? 'en' : 'ar';
const t = key => translate(language,key);
const num = number => new Intl.NumberFormat(language).format(number);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const gameById = id => catalog.find(game => game.id === id);
const icon = name => '<i data-icon="' + name + '" aria-hidden="true"></i>';
const button = (key, action, cls = 'secondary', symbol, attrs = '') => `<button type="button" class="button ${cls}" data-action="${action}" ${attrs}>${symbol ? icon(symbol) : ''}<span>${t(key)}</span></button>`;
let player;
let discordEnabled=false;
let discordSignedIn=false;
let room;
let dashboard = { online: 0, rooms: [], rankings: [], enabled: [] };
let activeDialog;
let libraryFilter='all';
let wordDraft;
let toastTimer;
const inviteParams = new URL(location.href).searchParams;
const inviteCode = inviteParams.get('room');
let selected;
let promotion = [];
let sendingMove = false;
let wildIndex;
let clockOffset = 0;
let warningKey;
let matchRenderKey;
let siteTheme=siteThemes.includes(saved('theme'))?saved('theme'):'dark';
let siteAccent=validAccent(saved('accent'))?saved('accent'):siteAccents[0];
const systemTheme=window.matchMedia('(prefers-color-scheme: light)');
const updateTheme=()=>applySiteTheme(document.documentElement,siteTheme,siteAccent,systemTheme.matches);
systemTheme.addEventListener('change',updateTheme);
let soundMuted = saved('soundMuted') === 'yes';
const sound = createSound({ getMuted:() => soundMuted, setMuted:value => { soundMuted = value; save('soundMuted',value ? 'yes' : 'no'); } });
const socket = window.io({ auth: callback => callback({ token: saved('token') }) });
const voice=setupVoice({socket,t,safe,call,notify:showNotice,getRoom:()=>room && player ? {code:room.code,id:player.id,host:room.host===player.id,enabled:room.voiceEnabled!==false} : null});

function go(page) {
  if (route() === page) render();
  else location.hash = page;
}
function paintAccountAvatar(){
  const avatar=$('#avatar');
  const markup=avatarImage(player?.avatar,safe)||(player?.name?safe([...player.name][0]):icon('user-round'));
  if(avatar.dataset.markup!==markup){
    avatar.innerHTML=markup;
    avatar.dataset.markup=markup;
  }
}
socket.on('account:appearance',data=>{
  if(!player)return;
  Object.assign(player,data);
  paintAccountAvatar();
});
async function discordAction(control) {
  if (!discordEnabled) { showNotice('discordDisabled'); return; }
  control.disabled=true;
  try {
    const endpoint=discordSignedIn?'logout':'start';
    const response=await fetch('/auth/discord/'+endpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(endpoint==='start'?{guest:saved('token')}:{})
    });
    const result=await response.json();
    if(!response.ok) {showNotice(result.error ?? 'discordFailed');return;}
    if(endpoint==='logout') location.reload();
    else location.assign(result.url);
  } catch {showNotice('discordFailed');}
  finally {control.disabled=false;}
}

function applyLanguage() {
  $('#avatar').setAttribute('aria-label',t('account'));
  $('#settings-link').setAttribute('aria-label',t('settings'));
  $('#settings-link').title=t('settings');
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = t('brand') + ' · ' + t('brandSub');
  $('#nav').setAttribute('aria-label', t('home') + ' / ' + t('games'));
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  paintInbox();
}
function updateClock() {
  const clock = $('.turn-clock');
  if (!clock) return;
  const remaining = Math.max(0,Number(clock.dataset.deadline)-Date.now()-clockOffset);
  const seconds = Math.ceil(remaining/1000);
  const value = clock.querySelector('.clock-value');
  const label = num(seconds);
  if (value.textContent !== label) value.textContent = label;
  clock.style.setProperty('--remaining', Math.min(1, remaining/(Number(clock.dataset.duration)*1000)));
  clock.classList.toggle('urgent',remaining <= 5000);
  const key = room.match.matchId + ':' + room.match.deadline;
  if (seconds > 0 && seconds <= 5 && room.match.active && warningKey !== key) {
    warningKey = key;
    sound.play('warning');
  }
}

function updateStatus() {
  $('#side-status').textContent = t(socket.connected ? 'connected' : 'disconnected');
  document.body.classList.toggle('connected', socket.connected);
}
function showNotice(key) {
  clearTimeout(toastTimer);
  notice.dataset.key = key;
  notice.textContent = t(key);
  notice.hidden = false;
  toastTimer = setTimeout(() => { notice.hidden = true; }, 4800);
}
function call(event, payload = {}) {
  if (!socket.connected) return Promise.resolve({ ok: false, error: 'disconnected' });
  return new Promise(resolve => socket.timeout(5500).emit(event, payload, (error, response) => {
    resolve(error ? { ok: false, error: 'timeout' } : response);
  }));
}
const heading = (title, description, action = '') => `<div class="section-head"><div><h2>${t(title)}</h2><p>${t(description)}</p></div>${action}</div>`;
const empty = (symbol, title, subtitle) => `<div class="empty">${icon(symbol)}<strong>${t(title)}</strong><p>${t(subtitle)}</p></div>`;
function rankings(limit = 25) {
  if (!dashboard.rankings.length) return empty('trophy', 'noRank', 'noRankText');
  return `<ol class="rank-list">${dashboard.rankings.slice(0, limit).map((entry, i) => `<li><span class="rank-number">${num(i + 1)}</span><span class="avatar">${safe(entry.name[0])}</span>${entry.profile ? '<a href="#profile/'+safe(entry.id)+'"><bdi>'+safe(entry.name)+'</bdi></a>' : '<bdi>'+safe(entry.name)+'</bdi>'}<strong>${num(entry.points)} <small>${t('points')}</small></strong></li>`).join('')}</ol>`;
}
function roomList(limit = Infinity) {
  if (!dashboard.rooms.length) return empty('users-round', 'noRooms', 'noRoomsText');
  return `<ul class="room-list">${dashboard.rooms.slice(0, limit).map(entry => `<li>
    <span class="square-icon">${icon('gamepad-2')}</span><div><strong><bdi>${safe(entry.name)}</bdi></strong><small>${t(entry.game)[0]} · ${num(entry.count)}/${num(entry.capacity)}</small></div>
    <div class="actions">${entry.playing ? '<span class="pill">' + t('playing') + '</span>' : (entry.count < entry.capacity || entry.botSeats) ? button('join','join','secondary','log-in', 'data-code="' + entry.code + '"') : '<span class="pill">' + t('roomFull') + '</span>'}${entry.allowSpectators && !room ? button('watch','watch','secondary',null,'data-code="' + entry.code + '"') : ''}</div></li>`).join('')}</ul>`;
}
function home() {
  return `<section class="hero"><div class="hero-image" aria-hidden="true"></div><div class="hero-gallery" aria-hidden="true">${['chess','ludo','color'].map(gameCover).join('')}</div><div class="hero-content">
    <p class="eyebrow">${icon('gamepad-2')}${t('heroTag')}</p>
    <h1>${t('heroLine')}<br><em>${t('heroAccent')}</em></h1><p class="hero-text">${t('heroText')}</p>
    <div class="actions">${room ? button('rooms','return','primary','users-round') : button('create','create','primary','plus') + button('join','join','secondary','log-in')}</div>
  </div></section>
  <section class="stats" aria-label="${t('home')}">
    ${[['users-round', dashboard.online, 'online'],['door-open',dashboard.rooms.length,'open'],['gamepad-2',menuGames.length,'catalogCount']].map(([symbol, value, label]) => `<div class="stat"><span class="square-icon">${icon(symbol)}</span><div><strong>${num(value)}</strong><span>${t(label)}</span></div></div>`).join('')}
  </section>
  <div class="home-grid"><div class="home-feed">
    <section>${heading('games','gameDescription',`<a class="text-link" href="#games">${t('viewGames')}</a>`)}<div class="games-grid home-games">${['ludo','color','replica-ar','chess'].map(gameById).map(game=>gameCard(game,{t,num,icon,enabled:dashboard.enabled})).join('')}</div></section>
    <section class="lower-section">${heading('publicRooms','publicDescription',`<a class="text-link" href="#rooms">${t('rooms')}</a>`)}<div class="panel">${roomList(4)}</div></section>
  </div><aside class="panel ranks-panel"><h2>${icon('trophy')}${t('rankings')}</h2><p>${t('rankDescription')}</p>${rankings(5)}<a href="#rankings" class="button secondary">${t('viewRanks')}</a></aside></div>`;
}
function render() {
  const oldWordForm=$('form[data-word-key]');
  if(oldWordForm) {
    const focused=document.activeElement;
    wordDraft={key:oldWordForm.dataset.wordKey,data:new FormData(oldWordForm),form:oldWordForm,
      focused:oldWordForm.contains(focused) ? focused.name : '',
      selection:[focused?.selectionStart,focused?.selectionEnd]};
  }
  const page = route();
  const chatInput = $('#chat-form input');
  const chatDraft = chatInput?.value;
  const chatSelection = [chatInput?.selectionStart,chatInput?.selectionEnd];
  const focusedSquare = document.activeElement?.closest('.board-square')?.dataset.index;
  const focusedMatch = document.activeElement?.closest('.match-panel');
  const priorHand = $('.private-hand .card-fan');
  const handScroll = priorHand?.scrollLeft ?? 0;
  const focusChat = document.activeElement === chatInput && !!chatInput;
  const oldMessages = $('#messages');
  const chatScroll = oldMessages?.scrollTop ?? 0;
  const stick = !oldMessages || oldMessages.scrollHeight - chatScroll - oldMessages.clientHeight < 32;
  updateStatus();
  const avatar = $('#avatar');
  paintAccountAvatar();
  currentNavigation($('#nav'),page);
  if(page==='account')avatar.setAttribute('aria-current','page');
  else avatar.removeAttribute('aria-current');
  if (page === 'home') main.innerHTML = home();
  if (page === 'games') main.innerHTML = renderLibrary(libraryFilter,{t,num,icon,enabled:dashboard.enabled,button});
  if (page === 'rooms' || (page === 'room' && !room)) {
    main.innerHTML = `<div class="page-head"><div><h1>${t('rooms')}</h1><p>${t('publicDescription')}</p></div><div class="actions">${room ? button('rooms','return','primary','users-round') : button('create','create','primary','plus') + button('join','join','secondary','log-in')}</div></div><section class="panel">${roomList()}</section>`;
  }
  if (['account','friends','shop','settings'].includes(page)) main.innerHTML=profileUI.page();
  if(page==='settings')$('#settings-link').setAttribute('aria-current','page');
  else $('#settings-link').removeAttribute('aria-current');
  if(page==='admin')main.innerHTML=adminUI.page();
  if(page==='reports')main.innerHTML=reportsUI.page();
  if (page === 'rankings') main.innerHTML = `<div class="page-head"><div><h1>${t('rankings')}</h1><p>${t('rankDescription')}</p></div></div><section class="panel">${rankings()}</section>`;
  if (page === 'room' && room) {
    const key = room.match && JSON.stringify([room.match.matchId,room.match.revision,room.match.active,language,selected,promotion,wildIndex,room.members.map(member => [member.online,member.controlledByBot])]);
    if (key && key === matchRenderKey && $('.match-panel')) {
      const updated = document.createElement('template');
      updated.innerHTML = renderRoom({room,player,t,safe,num,language,icon,button,selected,promotion,wildIndex}).trim();
      const nodes = updated.content.children;
      const [header,,grid] = nodes;
      $('.page-head').replaceWith(header);
      $('.room-grid').replaceWith(grid);
    } else main.innerHTML = renderRoom({room,player,t,safe,num,language,icon,button,selected,promotion,wildIndex});
    matchRenderKey = key;
    updateClock();
  } else matchRenderKey = undefined;
  voice.sync();
  syncPartyCanvas(main);
  restoreWordDraft();
  const messages = $('#messages');
  if (messages) messages.scrollTop = stick ? messages.scrollHeight : chatScroll;
  const input = $('#chat-form input');
  if (input && chatDraft !== undefined) {
    input.value = chatDraft;
    if (focusChat) { input.focus({preventScroll:true}); input.setSelectionRange(...chatSelection); }
  }
  const hand = $('.private-hand .card-fan');
  if (hand && hand !== priorHand) hand.scrollLeft = handScroll;
  if (focusedSquare !== undefined && focusedMatch && !focusedMatch.isConnected) {
    const square = $('.board-square[data-index="' + focusedSquare + '"]:not(:disabled)') ?? $('.board-square:not(:disabled)');
    square?.focus({preventScroll:true});
  }
}

function restoreWordDraft(){
  const form=$('form[data-word-key]');
  if(!form || !wordDraft || wordDraft.form===form || form.dataset.wordKey!==wordDraft.key) return;
  for(const input of form.querySelectorAll('input')) {
    if(input.type==='checkbox') input.checked=wordDraft.data.getAll(input.name).includes(input.value);
    else input.value=wordDraft.data.get(input.name) ?? '';
    if(input.name===wordDraft.focused && input.type!=='checkbox') {
      input.focus({preventScroll:true});
      if(Number.isInteger(wordDraft.selection[0])) input.setSelectionRange(...wordDraft.selection);
    }
  }
}

function inviteUrl(spectator = false) {
  const url = new URL(location.origin);
  url.searchParams.set('room', room.code);
  if (spectator) url.searchParams.set('role','spectator');
  return url.href;
}
function displayDialog(type, data = {}) {
  activeDialog = { type, data };
  const game = gameById(data.game) ?? catalog[0];
  const title = type === 'rules' ? menuName(game,t) : t(type);
  const field = (key, name, value, attrs) => `<label>${t(key)}<input name="${name}" value="${safe(value)}" ${attrs}></label>`;
  let content;
  const gameSelect = (entries, selectedGame) => '<label>' + t('game') + '<select name="game">' + entries.map(entry =>
    '<option value="' + entry.id + '"' + (entry.id === (selectedGame==='replica-en'?'replica-ar':selectedGame) ? ' selected' : '') + '>' + menuName(entry,t) + '</option>').join('') + '</select></label>';
  if (type === 'changeGame') {
    const humans = room.members.filter(member => !member.bot).length;
    content = '<form id="room-form" data-mode="changeGame">' + gameSelect(menuGames.filter(entry => entry.max >= humans), data.game ?? room.game) +
      '<p class="form-error" role="alert" hidden></p><button type="submit" class="button primary">' + t(type) + '</button></form>';
  } else if (type === 'rules') {

    const [,category,description]=t(game.id);
    const playerCount=game.min===game.max?num(game.min):num(game.min)+'–'+num(game.max);
    content = `${gameCover(game.id)}<div class="game-details-meta"><span class="pill">${safe(category)}</span><span class="pill">${t('coverPlayerCount')} <bdi>${playerCount}</bdi></span></div><p>${safe(game.id.startsWith('replica-')?t('coverReplicaDescription'):description)}</p><h3>${t('rules')}</h3><p>${(game.id.startsWith('replica-')?(language==='ar'?'اختاروا لغة الجولة ثم حرفاً لكل دور. اكتبوا اسماً ونباتاً وجماداً وحيواناً وبلداً. الإجابة الفريدة بعشر نقاط والمكررة بخمس.':'Choose the round language, then take turns picking letters. Write a name, plant, object, animal and country. Unique answers score ten and repeats score five.'):t(game.id)[3])}</p>${!room ? button('create','create','primary','plus',`data-game="${game.id}"`) : ''}`;


  } else if (type === 'resign') {
    content = '<p>' + t('resignText') + '</p>' + button('confirmResign','confirmResign','primary');
  } else if (type === 'invite') {
    if (!room) return;
    content = `<label>${t('roomCode')}<input value="${safe(room.code)}" readonly dir="ltr"></label><input id="invite-link" value="${safe(inviteUrl())}" readonly dir="ltr" aria-label="${t('copy')}">${button('copy','copy','primary','copy')}${room.allowSpectators ? '<input id="watch-link" value="' + safe(inviteUrl(true)) + '" readonly dir="ltr" aria-label="' + t('copyWatch') + '">' + button('copyWatch','copyWatch','secondary','copy') : ''}`;
  } else {
    content = `<form id="room-form" data-mode="${type}">
      ${field('nickname','nickname',data.nickname ?? player?.name ?? '', 'autocomplete="nickname" minlength="2" maxlength="24" required')}
      ${type === 'join' ? field('roomCode','code',data.code,'dir="ltr" minlength="8" maxlength="8" pattern="[A-Fa-f0-9]{8}" required') + '<label class="checkbox"><input type="checkbox" name="watch" ' + (data.watch ? 'checked' : '') + '> ' + t('watchRole') + '</label>' :
        `${field('roomName','name',data.name,'maxlength="40" required')}<label>${t('game')}<select name="game">${menuGames.map(entry => `<option value="${entry.id}" ${entry.id === game.id ? 'selected' : ''}>${menuName(entry,t)}</option>`).join('')}</select></label><label class="checkbox"><input type="checkbox" name="listed" ${data.listed ? 'checked' : ''}> ${t('listed')}</label><label class="checkbox"><input type="checkbox" name="allowSpectators" ${data.allowSpectators === false ? '' : 'checked'}> ${t('allowSpectators')}</label><label>${t('turnTimer')}<select name="turnSeconds">${turnOptions.map(seconds => `<option value="${seconds}" ${Number(data.turnSeconds ?? 0) === seconds ? 'selected' : ''}>${seconds ? num(seconds) + ' ' + t('seconds') : t('timerOff')}</option>`).join('')}</select></label><label class="checkbox"><input type="checkbox" name="botFill" ${data.botFill ? 'checked' : ''}> ${t('automaticBot')}</label><label class="checkbox"><input type="checkbox" name="voiceEnabled" ${data.voiceEnabled ? 'checked' : ''}> ${t('voiceChat')}</label>`}
      <p class="form-error" role="alert" hidden></p><button type="submit" class="button primary">${t(type)}</button></form>`;
  }
  dialog.innerHTML = `<div class="dialog-title"><h2 id="dialog-title">${title}</h2><div class="top-actions"><button type="button" class="icon-button" data-action="close" aria-label="${t('close')}">${icon('x')}</button></div></div><div class="dialog-content">${content}</div>`;
  const select=dialog.querySelector('select[name="game"]');
  if(select){
    const initial=data.game??(type==='changeGame'?room.game:'');
    if(initial==='replica-en')select.value='replica-ar';
    const label=document.createElement('label');
    label.innerHTML=t('gameLanguage')+'<select name="roundLanguage"><option value="ar">العربية</option><option value="en">English</option></select>';
    select.parentElement.after(label);
    label.lastChild.value=data.roundLanguage??(initial==='replica-en'?'en':initial==='replica-ar'&&type==='changeGame'?'ar':language);
    const sync=()=>{label.hidden=select.value!=='replica-ar';};
    select.addEventListener('change',sync);sync();
  }
  if(type==='invite'&&discordSignedIn){
    const box=document.createElement('section');
    dialog.querySelector('.dialog-content').prepend(box);
    fetch('/auth/discord/profile',{cache:'no-store'}).then(r=>r.json()).then(p=>{
      if(!box.isConnected||!p.friends)return;
      box.innerHTML='<h3>'+t('inviteFriend')+'</h3>'+p.friends.filter(f=>f.relationship==='friends'&&!room?.members.some(m=>m.id===f.id)).map(f=>
        '<button class="button secondary" data-invite-to="'+safe(f.id)+'">'+safe(f.name)+'</button>').join('')+' <a href="#friends">'+t('friends')+'</a>';
      box.querySelector('a').onclick=()=>dialog.close();
    }).catch(()=>{box.textContent=t('disconnected');});
  }
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('input:not([readonly])')?.focus();
}

function setLanguage(next) {
  const form = $('#room-form');
  const values = form ? Object.fromEntries(new FormData(form)) : {};
  language = next;
  save('lang', language);
  applyLanguage();
  render();
  if (!notice.hidden) notice.textContent = t(notice.dataset.key);
  profileUI.paintPreview();
  if (activeDialog) displayDialog(activeDialog.type, { ...activeDialog.data, ...values, ...(form ? { listed: Boolean(values.listed), watch: Boolean(values.watch), allowSpectators: Boolean(values.allowSpectators), botFill: Boolean(values.botFill), voiceEnabled:Boolean(values.voiceEnabled) } : {}) });
}
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.matches('[data-site-language]')&&['ar','en'].includes(input.value)){
    setLanguage(input.value);
    $('[data-site-language]')?.focus();
  }
  if(input.matches('[data-site-theme]')&&siteThemes.includes(input.value)){
    siteTheme=input.value;
    save('theme',siteTheme);
    updateTheme();
  }
  if(input.matches('[data-site-accent]')&&validAccent(input.value)){
    siteAccent=input.value;
    save('accent',siteAccent);
    updateTheme();
  }
  if(input.matches('[data-site-sounds]')&&input.checked===soundMuted){
    sound.toggle();
    }
});
document.addEventListener('pointerdown',sound.enable,{ passive:true });
document.addEventListener('keydown',sound.enable);
document.addEventListener('keydown',event => {
  const square = event.target.closest?.('.board-square');
  if (!square) return;
  const board = square.parentElement;
  const cols = Number(board.style.getPropertyValue('--columns'));
  const direction = { ArrowLeft:-1,ArrowRight:1,ArrowUp:-cols,ArrowDown:cols }[event.key];
  if (!direction) return;
  event.preventDefault();
  const start = Number(square.dataset.index);
  let next = start + direction;
  while (next >= 0 && next < board.children.length) {
    if (Math.abs(direction) === 1 && Math.floor(start/cols) !== Math.floor(next/cols)) break;
    const cell = board.children[next];
    if (!cell.disabled) { cell.focus({preventScroll:true}); break; }
    next += direction;
  }
});
setInterval(updateClock,150);
$('.skip').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView({ block:'start' });
});
dialog.addEventListener('close', () => { if (!dialog.open) activeDialog = undefined; });
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
document.addEventListener('click', async event => {
  const node = event.target.closest('[data-action]');
  if (!node || node.disabled) return;
  const { action, game, code } = node.dataset;
  if (['create','join','rules','invite','resign','changeGame'].includes(action)) displayDialog(action, { game, code });
  if(action==='shipStart'){const result=await call('ship:start',{});if(!result.ok)showNotice(result.error);}
  if (action === 'close') dialog.close();
  if (action === 'return') go('room');
  if (action === 'confirmResign') {
    node.disabled = true;
    const response = await call('match:resign');
    node.disabled = false;
    if (response.ok) dialog.close();
    else showNotice(response.error);
  }
  if(action==='library' && ['all',...Object.keys(libraryGroups)].includes(node.dataset.group)) {
    libraryFilter=node.dataset.group;
    render();
    $('.library-filter[aria-pressed="true"]')?.focus({preventScroll:true});
  }
  if(action==='surprise') {
    const pool=filterGames(libraryFilter).filter(entry=>dashboard.enabled.includes(entry.id));
    if(pool.length) displayDialog('rules',{game:pool[Math.floor(Math.random()*pool.length)].id});
  }
  if(action==='accountLogin'||action==='accountLogout'){void discordAction(node);return;}
  if (action === 'wordLetter' || action === 'wordNext') {void sendWord(action==='wordLetter'?'letter':'next',{letter:node.dataset.letter});return;}
  if (action === 'watch') displayDialog('join',{ code, watch:true });
  if (action === 'copy' || action === 'copyWatch') {
    const watching = action === 'copyWatch';
    try { await navigator.clipboard.writeText(inviteUrl(watching)); showNotice('copied'); }
    catch { $(watching ? '#watch-link' : '#invite-link').select(); showNotice(watching ? 'copyWatchFail' : 'copyFailed'); }
  }
  if (action === 'wild') { wildIndex = node.dataset.move; render(); $('.color-picker button')?.focus(); }
  if (action === 'cancelWild') { wildIndex = undefined; render(); }
  if (action === 'move') await playMove(node.dataset.move);
  if (action === 'square') await playSquare(node.dataset.square);
  const command = { ready:'room:ready', leave:'room:leave', start:'match:start', addBot:'room:bot', removeBot:'room:removeBot', rematch:'match:rematch', react:'room:reaction' }[action];
  if (command) {
    node.disabled = true;
    const response = await call(command,{ emoji:node.dataset.emoji, playerId:node.dataset.playerId });
    node.disabled = false;
    if (!response.ok) showNotice(response.error);
  }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['room-form','chat-form'].includes(form.id)) return;
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  const values = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  if (form.id === 'room-form') {
    const mode = form.dataset.mode;
    if(values.game==='replica-ar'&&values.roundLanguage==='en')values.game='replica-en';
    values.listed = values.listed === 'on';
    values.allowSpectators = values.allowSpectators === 'on';
    values.turnSeconds = Number(values.turnSeconds ?? 0);
    if(mode==='create')values.voiceEnabled=Boolean(values.voiceEnabled);
    values.botFill = Boolean(values.botFill);
    values.role = values.watch ? 'spectator' : 'player';
    const response = await call(mode === 'changeGame' ? 'room:game' : 'room:' + mode,values);
    submit.disabled = false;
    if (response.ok) {
      if (values.nickname && !discordSignedIn) player.name = values.nickname.trim();
      if (activeDialog?.type === mode && dialog.open) dialog.close();
      const url = new URL(location.href);
      url.searchParams.delete('room');
      url.searchParams.delete('role');
      history.replaceState(null, '', url);
      go('room');
    } else {
      const error = activeDialog?.type === mode && $('#room-form .form-error');
      if (error) {
        error.textContent = t(response.error);
        error.hidden = false;
      } else showNotice(response.error);
    }
  } else {
    const response = await call('chat:send', { text: values.message });
    submit.disabled = false;
    if (!response.ok) showNotice(response.error);
    else {
      const current = $('#chat-form input');
      if (current && current.value === values.message) current.value = '';
    }
  }
});

function sendWord(type,payload={}){
  const word=room?.match?.wordRound;
  if(!word) return;
  return playMove({type,phase:word.phase,round:word.round,...payload});
}
document.addEventListener('submit',async event=>{
  const form=event.target.closest?.('form[data-word]');
  if(!form)return;
  event.preventDefault();
  const data=new FormData(form);
  const button=form.querySelector('button[type=submit]');
  button.disabled=true;
  try {
    await sendWord(form.dataset.word,form.dataset.word==='review' ? {flags:data.getAll('flag').map(Number)} : {values:Object.fromEntries(data)});
  } finally {button.disabled=false;}
});

document.addEventListener('submit',async event=>{
  const orbit=event.target.closest?.('[data-orbit-form]');
  if(orbit){event.preventDefault();const command=event.submitter?.dataset.command;if(command)await playMove(JSON.parse(command));return;}
  const form=event.target.closest?.('[data-party-form]');
  if(!form)return;
  event.preventDefault();
  const type=form.dataset.partyForm;
  const field=event.submitter?.value??'';
  const value=form.querySelector('[name=answer]')?.value??
    (type==='draw'||type==='relayDraw'?drawingFor(form):type==='identify'?Number(field):field);
  await playMove({type,value});
});

let shipInterval;
function stopWalking(){clearInterval(shipInterval);shipInterval=undefined;}
function startWalking(dir){
  stopWalking();
  const step=()=>{
    if(!document.querySelector('.ship-pad')||document.querySelector('dialog[open]'))return stopWalking();
    void playMove({type:'step',value:dir});
  };
  step();shipInterval=setInterval(step,145);
}
document.addEventListener('pointerdown',e=>{
  const dir=e.target.closest('[data-ship-dir]')?.dataset.shipDir;
  if(dir){e.preventDefault();startWalking(dir);}
});
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,stopWalking);
window.addEventListener('blur',stopWalking);
const shipKeys={ArrowLeft:'left',KeyA:'left',ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowRight:'right',KeyD:'right'};
document.addEventListener('keydown',e=>{
  if(!shipKeys[e.code]||!document.querySelector('.ship-pad')||e.target.closest('input,textarea,select,[contenteditable=true],dialog'))return;
  e.preventDefault();if(!e.repeat)startWalking(shipKeys[e.code]);
});
document.addEventListener('keyup',e=>{if(shipKeys[e.code])stopWalking();});
async function playMove(move) {
  if (!room?.match?.active || sendingMove) return;
  sendingMove = true;
  const response = await call('match:move',{ move, revision:room.match.revision, matchId:room.match.matchId });
  sendingMove = false;
  if (response.ok) { selected = undefined; promotion = []; wildIndex = undefined; }
  else if(move?.type!=='step'||response.error!=='badMove')showNotice(response.error);
}

async function playSquare(square) {
  if (!room?.match?.active || sendingMove) return;
  if (room.game === 'checkers') {
    const moves=room.match.legal;
    const move=selected===undefined ? null : selected + ':' + square;
    if(move && moves.includes(move)) {await playMove(move);return;}
    selected=moves.some(entry=>entry.startsWith(square+':')) && selected!==square ? square : undefined;
    render();
    return;
  }
  if (room.game !== 'chess') { await playMove(square); return; }
  const legal = room.match.legal;
  const targets = selected && legal.filter(move => move.startsWith(selected + square));
  if (targets?.length === 1) { await playMove(targets[0]); return; }
  if (targets?.length > 1) promotion = targets;
  else {
    selected = selected !== square && legal.some(move => move.startsWith(square)) ? square : undefined;
    promotion = [];
  }
  render();
}

let inboxItems=[];
function paintInbox(){
 const el=$('#room-inbox');
 el.innerHTML=inboxItems.filter(i=>i.expires>Date.now()).map(i=>'<article><strong>'+t('roomInvitation')+'</strong><p><bdi>'+safe(i.name)+'</bdi> · '+safe(i.room)+'</p><button class="button primary" data-reply="yes" data-key="'+safe(i.key)+'">'+t('friendAccept')+'</button> <button class="button secondary" data-reply="no" data-key="'+safe(i.key)+'">'+t('friendDecline')+'</button></article>').join('');
 el.hidden=!el.childElementCount;
 const count=$('#notification-count');
 if(count){count.textContent=num(inboxItems.filter(i=>i.expires>Date.now()).length);count.hidden=!inboxItems.some(i=>i.expires>Date.now());}
}
socket.on('room:inbox',items=>{inboxItems=items;paintInbox();});
setInterval(()=>{if(inboxItems.some(i=>i.expires<=Date.now())){inboxItems=inboxItems.filter(i=>i.expires>Date.now());paintInbox();}},1000);
$('#notifications-button')?.addEventListener('click',()=>{const el=$('#room-inbox');if(el)el.hidden=!el.hidden;});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-invite-to],[data-reply]');if(!b||b.disabled)return;
 b.disabled=true;
 const send=b.hasAttribute('data-invite-to'),accept=b.dataset.reply==='yes';
 const result=await call(send?'invite:send':'invite:reply',send?{to:b.dataset.inviteTo}:{key:b.dataset.key,accept});
 if(!result.ok){b.disabled=false;if(b.closest('#profile-dialog')){const status=b.parentElement.querySelector('[role=status]')??document.createElement('p');status.setAttribute('role','status');status.textContent=t(result.error);b.parentElement.append(status);}else showNotice(result.error);}
 else if(send)b.textContent=t('sentInvite');
 else if(accept){dialog.close();go('room');}
});
let inviteOpened = false;
socket.on('hello', data => {
  discordSignedIn=Boolean(data.discord);
  if(data.token) save('token',data.token);
  else localStorage.removeItem('saha:token');
  player = data.player;
  room = data.room;
  if (room?.serverTime) clockOffset = room.serverTime - Date.now();
  if (room && !['account','friends','shop','settings','reports','admin'].includes(route())) go('room');
  render();
  if (!inviteOpened && !room && inviteCode) {
    inviteOpened = true;
    displayDialog('join', { code: inviteCode, watch: inviteParams.get('role') === 'spectator' });
  }
});
function showReaction(reaction) {
  const target = [...document.querySelectorAll('[data-player]')].find(node => node.dataset.player === reaction.playerId) ?? $('.reaction-feed');
  if (!target) return;
  const bubble = document.createElement('span');
  bubble.className = 'reaction-bubble';
  bubble.textContent = reaction.emoji;
  if (target.classList.contains('reaction-feed')) bubble.textContent = reaction.name + ' ' + reaction.emoji;
  target.append(bubble);
  setTimeout(() => bubble.remove(),1550);
}

function launchShip(session){
    const panel=document.createElement('dialog');
    panel.className='saha-ship-player';
    const frame=document.createElement('iframe');
    frame.title=t('orbit')[0];
    frame.allow='autoplay; fullscreen';
    frame.dataset.host=String(player.id===room.host);
    frame.dataset.ship=room.shipKey;
    frame.dataset.name=room.members.find(p=>p.id===player.id)?.name??'Player';
    frame.dataset.capacity=String(session.size);
    frame.dataset.humans=String(session.members.length);
    frame.onload=()=>frame.focus();
    frame.src='/among-us/';
    const close=document.createElement('button');close.className='button secondary';
    close.textContent=language==='ar'?'العودة للغرفة':'Back to room';close.onclick=()=>panel.close();
    panel.append(frame,close);document.body.append(panel);
    panel.addEventListener('close',()=>{panel.remove();if(player.id===room?.host&&room.shipSession?.id===session.id)void call('ship:end',{session:session.id});},{once:true});panel.showModal();
}
socket.on('room', next => {
  if(next?.code!==room?.code||next?.game!=='orbit'||next?.role!=='player'||next.host!==room?.host)document.querySelector('.saha-ship-player')?.close();
  const previous = room;
  const before = previous?.match;
  const after = next?.match;
  const fresh = after && after.matchId !== before?.matchId;
  const changed = after && (fresh || after.revision !== before?.revision);
  if (next?.serverTime) clockOffset = next.serverTime - Date.now();
  if (next?.code !== room?.code || changed || !after?.active) {
    selected = undefined;
    promotion = [];
    wildIndex = undefined;
  }
  room = next;
  if(previous?.shipSession?.id!==next?.shipSession?.id){
    document.querySelector('.saha-ship-player')?.close();
    if(next?.role==='player'&&next.shipSession?.members.includes(player?.id))launchShip(next.shipSession);
  }
  if (!room && route() === 'room') go('rooms');
  else if (route() === 'room') {
    render();
    if (changed) {
      animateMatch($('.match-panel'),after,before);
      if (after.finished && !after.abandoned && after.winners?.length) {
        sound.play(room.role === 'spectator' || after.winners.includes(player?.id) ? 'win' : 'loss');
      } else if (fresh) {
        if (after.active) sound.play('turn');
      } else {
        const effect = after.effect?.type;
        sound.play(['draw2','draw4','wild','reverse','skip','trump'].includes(effect) ? 'special' :
          ['roll','draw','card','move','hop','tile','capture','home'].includes(effect) ? effect : 'card');
        if (after.active && (!before.active || after.turn !== before.turn)) setTimeout(() => sound.play('turn'),180);
      }
    }
    if (next?.reaction?.id && next.reaction.id !== previous?.reaction?.id && Date.now()+clockOffset-next.reaction.time < 2200) showReaction(next.reaction);
  }
});
socket.on('dashboard', next => {
  dashboard = next;
  if (route() !== 'room' && !['account','friends','shop','settings','reports','admin'].includes(route())) render();
});
socket.on('connect', updateStatus);
socket.on('disconnect', updateStatus);
const adminUI=setupAdmin({route,t,safe,render,go,notify:showNotice});
socket.on('account:blocked',reason=>{showNotice(reason==='networkBanned'?'networkBanned':'accountBanned');});
const reportsUI=setupReports({route,render,t,safe,signedIn:()=>discordSignedIn,prepareImage:imageForUpload});
const profileUI=setupProfileUI({t,safe,num,route,render,getSitePreferences:()=>({language,soundMuted,siteTheme,siteAccent}),signedIn:()=>discordSignedIn,canInvite:id=>Boolean(room?.role==='player'&&(!room.match||room.match.finished)&&!room.members.some(member=>member.id===id)),setName:name=>{if(player)player.name=name;}});
let presenceTimer;
let idle=false;
function updatePresence(){
  clearTimeout(presenceTimer);
  const next=document.hidden;
  if(next!==idle){idle=next;if(socket.connected&&discordSignedIn)socket.emit('profile:idle',idle);}
  if(!next)presenceTimer=setTimeout(()=>{
    idle=true;
    if(socket.connected&&discordSignedIn)socket.emit('profile:idle',true);
  },300000);
}
for(const event of ['pointerdown','keydown','visibilitychange'])document.addEventListener(event,updatePresence);
socket.on('hello',()=>{
  if(discordSignedIn)socket.emit('profile:idle',idle||document.hidden);
  void profileUI.load();
  void reportsUI.load();
  void adminUI.access();
});
updatePresence();
setupBadgeDetails(t);
createNavigation($('#nav'));
updateTheme();
applyLanguage();
render();
fetch('/auth/discord/status',{cache:'no-store'}).then(r=>r.json()).then(status=>{
  discordEnabled=status.enabled;
  discordSignedIn=status.signedIn;
}).catch(()=>{});
const authParams=new URL(location.href);
const authMessage=authParams.searchParams.get('discord');
if(['discordSuccess','discordFailed','discordCancelled','discordDisabled','accountBanned','networkBanned','importComplete','importWrongAccount','importConnectionsFailed'].includes(authMessage)) {
  authParams.searchParams.delete('discord');
  history.replaceState(null,'',authParams);
  showNotice(authMessage);
}

