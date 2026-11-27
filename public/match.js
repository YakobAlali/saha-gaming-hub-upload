import {matchClock,resultActions} from './games/match-chrome.js';
import {boardMarkup} from './games/board.js';
import {renderOrbit} from './games/orbit.js';
import {renderParty} from './party-game.js';
import { drawStack, renderArena } from './arena.js';
import { renderReplica } from './replica.js';
import { ludoBoard, ludoDie } from "./ludo.js";
export { pawnCell } from "./ludo.js";

const unoMarks = { skip:'⊘',reverse:'⇄',draw2:'+2',draw4:'+4',wild:'◈' };
const colors = ['red','blue','green','yellow'];
export const reactionEmojis = ['👏','🔥','😂','😮','❤️','🤝'];

function dominoFace(value) {
  const pips = [[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
  return '<span class="domino-face" aria-hidden="true">' + value.split('–').map(half =>
    '<span class="domino-half">' + Array.from({length:9},(_, index) => '<i' + (pips[half]?.includes(index) ? ' class="pip"' : '') + '></i>').join('') + '</span>'
  ).join('') + '</span>';
}

function playingFace(rank,suit) {
  return '<span class="playing-corner"><b>' + rank + '</b><i>' + suit + '</i></span><span class="playing-suit">' + suit +
    '</span><span class="playing-corner far"><b>' + rank + '</b><i>' + suit + '</i></span>';
}

export function renderMatch(room,{ t,safe,selected,promotion = [],wildIndex,viewerId }) {
  if (!room.match) return '';
  const match = room.match;
  if(match.orbit)return renderOrbit(room,{t,safe,viewerId});
  if(match.party)return renderParty(room,{t,safe,viewerId});
  if (match.wordRound) return renderReplica(room,{t,safe,viewerId});
  const name = id => {
    const seat = room.members.findIndex(member => member.id === id);
    const member = room.members[seat];
    return member?.bot ? t('bot') + ' ' + (seat+1) : member?.name ?? '';
  };
  const say = (key,...args) => safe(t(key).replace(/\{(\d+)\}/g,(_,index) => args[index] ?? ''));
  const actionButton = (value,label) => '<button type="button" class="button secondary game-action" data-action="move" data-move="' + safe(value) + '">' + label + '</button>';
  const formatItem = item => {
    if (item.label === 'unoCard' || item.label === 'unoWild') return say(item.label,...item.args.map(arg => /^\d$/.test(arg) ? arg : t(arg === 'skip' ? 'skipCard' : arg)));
    return say(item.label,...item.args);
  };
  function face(item) {
    if (item.label === 'unoCard') {
      const mark = safe(unoMarks[item.args[1]] ?? item.args[1]);
      const tone = ['wild','draw4'].includes(item.args[1]) ? 'wild' : item.args[0];
      return '<span class="uno-face token-' + safe(tone) + '" aria-hidden="true"><b>' + mark + '</b><i>' + mark + '</i><b>' + mark + '</b></span>';
    }
    const value = safe(item.args.at(-1));
    if (item.label === 'tile') return dominoFace(value);
    const suit = value.at(-1);
    return '<span class="classic-face ' + ('♥♦'.includes(suit) ? 'red-suit' : '') + '" aria-hidden="true">' + playingFace(value.slice(0,-1),suit) + '</span>';
  }
  function itemList(items,label,hand = false) {
    if (!items?.length) return '';
    const entries = items.map((item,index) => ({item,index}));
    if (hand && room.game === 'tarneeb') entries.sort((a,b) => a.item.args[0].slice(-1).localeCompare(b.item.args[0].slice(-1)));
    return '<div class="match-items ' + (hand ? 'private-hand' : 'table-hand') + '"><strong>' + say(label) + '</strong><div class="card-fan ' +
      (hand && ['tarneeb','color'].includes(room.game) ? 'arena-fan' : '') + '">' + entries.map(({item,index},order) => {
        const wild = item.label === 'unoCard' && item.args[0] === 'wild';
        const direct = match.actions?.some(action => ['unoCard','card'].includes(action.label) && action.value === String(index));
        const wildLegal = wild && match.actions?.some(action => action.value.startsWith(index + ':'));
        const interactive = hand && (direct || wildLegal) && room.game !== 'domino';
        const spread = hand && ['tarneeb','color'].includes(room.game) ? 2*order/Math.max(1,entries.length-1)-1 : 0;
        const tilt = spread * Math.min(11,entries.length*1.8);
        const arc = Math.abs(spread)*Math.min(11,entries.length*1.5);
        const muted = hand && match.active && !interactive && room.game !== 'domino';
        const attrs = ' class="physical-card ' + (interactive ? 'legal-card ' : '') + (muted ? 'muted-card' : '') +
          '" style="--order:' + order + ';--tilt:' + tilt + 'deg;--arc:' + arc + 'px"';
        return interactive ? '<button type="button"' + attrs + ' data-action="' + (wildLegal ? 'wild' : 'move') + '" data-move="' + index +
          '" aria-label="' + formatItem(item) + '">' + face(item) + '</button>' :
          '<span' + attrs + ' role="img" aria-label="' + formatItem(item) + '">' + face(item) + '</span>';
      }).join('') + '</div></div>';
  }
  const winners = match.winners ?? [];
  const outcome = match.finished && !match.abandoned && winners.length && room.role !== 'spectator' ?
    (winners.includes(viewerId) ? say('youWon') : say('youLost')) : '';
  const status = match.finished ? match.abandoned ? say('abandoned') : winners.length ? say('win',winners.map(name).join(' / ')) : say('drawResult')
    : match.active ? say('yourTurn') : say('turnOf',name(match.turn));
  let board = '';
  if (match.board) board = boardMarkup(room,match,selected,say,safe);
  if (match.pawns) board = ludoBoard(match,room,say);
  const details = match.tarneeb;
  const broadcast = match.effect?.type;
  const effectKey = ['draw2','draw4','reverse','skip','wild','trump','capture','home'].includes(broadcast) ? 'effect_' + broadcast : '';
  const meta = [
    match.check && say('check'),
    details && say(({bid:'phaseBid',trump:'phaseTrump',play:'phasePlay'})[details.phase]),
    details?.bid && say('bidScore',details.bid),
    details?.trump && say('trump',details.trump),
    details && say('tricks',...details.scores)
  ].filter(Boolean);
  const uno = room.game === 'color';
  const actions = match.actions?.filter(item => !['unoWild','unoCard','card','roll'].includes(item.label) && !(uno && item.value === 'draw')) ?? [];
  const canRoll = match.actions?.some(item => item.value === 'roll');
  const timer=matchClock(match,say);
  const next=resultActions(room,viewerId,say);
  const colorOptions = wildIndex === undefined ? [] : colors.filter(color => match.actions?.some(action => action.value === wildIndex + ':' + color));
  const colorPicker = colorOptions.length ? '<div class="color-picker"><strong>' + say('pickColor') + '</strong><div>' +
    colorOptions.map(color => '<button class="button token-' + color + '" type="button" data-action="move" data-move="' + wildIndex + ':' + color + '">' + say(color) + '</button>').join('') +
    '<button class="button secondary" type="button" data-action="cancelWild">' + say('cancelChoice') + '</button></div></div>' : '';
  const summaries=match.table?.filter(item=>['cardTotals','eightCurrentSuit'].includes(item.label)).map(formatItem).join(' · ');
  const table = itemList(match.table?.filter(item=>!['cardTotals','eightCurrentSuit'].includes(item.label)),uno ? 'discardPile' : 'table');
  const color = uno && colors.includes(match.table?.[0]?.args[0]) ? match.table[0].args[0] : '';
  const tableCenter = uno ? '<div class="arena-piles">' + drawStack(say,match.actions?.some(item => item.value === 'draw')) + table + '</div>' :
    table || (['tarneeb','domino'].includes(room.game) ? '<p class="table-awaiting">' + say('awaitingPlay') + '</p>' : '');
  const center = (summaries?'<p class="match-meta">'+summaries+'</p>':'')+board +
    (match.pawns ? ludoDie(match.die,canRoll,say) : '') +
    (promotion.length ? '<div class="match-items"><strong>' + say('promote') + '</strong><div>' +
      promotion.map(move => actionButton(move,say(move.at(-1)))).join('') + '</div></div>' : '') + tableCenter;
  return '<section class="panel match-panel game-' + room.game + (match.finished ? ' match-finished' : '') +
    (match.check ? ' match-check' : '') + '"><div class="panel-heading"><div><p class="match-kicker">' + say('match') + '</p><h2>' + safe(t(room.game)[0]) +
    '</h2></div><div class="match-status" aria-live="polite"><span class="pill' + (match.active ? ' active-turn' : '') + '" dir="auto">' + status +
    '</span>' + (outcome ? '<strong>' + outcome + '</strong>' : '') + '</div></div>' + timer +
    (effectKey ? '<p class="special-effect ' + (match.effect.color ? 'token-' + safe(match.effect.color) : '') + '">' + say(effectKey) + '</p>' : '') +
    (meta.length ? '<p class="match-meta">' + meta.join(' · ') + '</p>' : '') +
    renderArena(room,viewerId,name,say,safe,center,color) + itemList(match.hand,'hand',true) + colorPicker +
    (actions.length ? '<div class="match-actions">' + actions.map(item => actionButton(item.value,formatItem(item))).join('') + '</div>' : '') +
    (match.history?.length ? '<details class="match-history"><summary>' + say('history') + '</summary><p dir="ltr">' + safe(match.history.join(' · ')) + '</p></details>' : '') +
    next + '</section>';
}
