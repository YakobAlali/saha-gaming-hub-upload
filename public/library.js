import {catalog} from './catalog.js';
import {gameCover} from './game-cover.js';
export const menuGames=catalog.filter(g=>g.id!=='replica-en');
export const menuName=(game,t)=>game.id.startsWith('replica-')?t('replicaCoverTitle'):t(game.id)[0];
export const libraryGroups={deduction:['orbit'],strategy:['chess','connect','tic','reversi','gomoku','checkers'], cards:['color','tarneeb','eights','hearts','spades'], party:['undercover','sketch'], board:['ludo','domino'], words:['replica-ar','replica-en']};
export function gameCard(game,{t,num,icon,enabled}) {
  const [, category, description] = t(game.id);
  return `<button class="game-card" type="button" data-action="rules" data-game="${game.id}">
    ${gameCover(game.id)}<div class="card-copy"><small>${category}</small><h3>${menuName(game,t)}</h3><p>${description}</p>
    <div class="card-meta">${icon('users-round')} ${num(game.min)}${game.max !== game.min ? '–' + num(game.max) : ''}<span>${t(enabled.includes(game.id) ? 'playable' : 'planned')}</span></div></div></button>`;
}
export function filterGames(libraryFilter) {
  return menuGames.filter(game=>libraryFilter==='all'||libraryGroups[libraryFilter].includes(game.id));
}
export function renderLibrary(libraryFilter,{t,num,icon,enabled,button}) {
  const filters=['all',...Object.keys(libraryGroups)].map(group =>
    '<button type="button" data-action="library" data-group="' + group + '" aria-pressed="' + (libraryFilter===group) +
    '" class="button secondary library-filter">' + t('filter_'+group) + '</button>').join('');
  return '<div class="page-head library-head"><div><h1>' + t('games') + '</h1><p>' + t('gameDescription') + '</p></div>' +
    button('surpriseGame','surprise','primary','gamepad-2') + '</div><div class="library-filters" role="group" aria-label="' + t('games') + '">' +
    filters + '</div><div class="games-grid">' + filterGames(libraryFilter).map(game=>gameCard(game,{t,num,icon,enabled})).join('') + '</div>';
}
