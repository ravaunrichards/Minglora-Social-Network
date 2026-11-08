/* Minglora Reels navigation and feed lanes, using real posts and the existing Reel player. */
(() => {
'use strict';
const main=document.getElementById('main-content');if(!main)return;
const scopes=[{value:'all',label:'Home',icon:'home'},{value:'following',label:'Following',icon:'explore'},{value:'friends',label:'Friends',icon:'friends'},{value:'subscribers',label:'Subscribers',icon:'creator'},{value:'profile',label:'Profile',icon:'profile'}];
const isReels=root=>Boolean(root?.querySelector('[data-video-mode="reels"].active'));
function sync(root){const current=root.querySelector('#video-scope')?.value||'all';root.querySelectorAll('[data-reels-scope]').forEach(button=>{const selected=button.dataset.reelsScope===current;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});}
function enhance(root){
 if(!isReels(root)){document.body.classList.remove('minglora-reels-active');return;}
 document.body.classList.add('minglora-reels-active');if(root.querySelector('.reels-view-shell')){sync(root);return;}
 const heading=root.querySelector('.video-centre-heading'),modes=root.querySelector('.video-centre-mode-switch'),toolbar=root.querySelector('.video-centre-toolbar'),feed=root.querySelector('#video-centre-feed'),note=root.querySelector('.video-centre-note'),scopeLabel=toolbar?.querySelector('label[for="video-scope"]'),searchLabel=toolbar?.querySelector('label[for="video-search"]'),create=heading?.querySelector('#video-create-button');
 if(!feed||!toolbar||!scopeLabel||!searchLabel)return;
 const shell=document.createElement('div');shell.className='reels-view-shell';
 const side=document.createElement('aside');side.className='reels-experience-sidebar';side.setAttribute('aria-label','Reels navigation');
 side.innerHTML='<div class="reels-experience-title"><span class="reels-experience-mark" aria-hidden="true">▶</span><strong>Reels</strong></div><nav class="reels-experience-links" aria-label="Reels feeds">'+scopes.map(item=>'<button type="button" class="reels-experience-link" data-reels-scope="'+item.value+'" aria-pressed="false"><span class="reels-experience-icon" aria-hidden="true"><svg class="nav-3d-icon" viewBox="0 0 64 64" focusable="false"><use href="/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#'+item.icon+'"></use></svg></span><span>'+item.label+'</span></button>').join('')+'</nav>';
 if(create){create.classList.add('reels-experience-create');create.textContent='＋ Create Reel';create.setAttribute('aria-label','Create a Reel');side.appendChild(create);}
 const content=document.createElement('section');content.className='reels-experience-content';content.setAttribute('aria-label','Reels feed');
 searchLabel.classList.add('reels-experience-search');feed.classList.add('reels-experience-feed');heading?.setAttribute('hidden','');modes?.setAttribute('hidden','');toolbar.setAttribute('hidden','');scopeLabel.setAttribute('hidden','');
 content.appendChild(searchLabel);content.appendChild(feed);if(note)content.appendChild(note);shell.appendChild(side);shell.appendChild(content);root.appendChild(shell);sync(root);
}
document.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest('[data-reels-scope]'):null;if(!button)return;const root=button.closest('.video-centre'),select=root?.querySelector('#video-scope');if(!select)return;select.value=button.dataset.reelsScope;select.dispatchEvent(new Event('change',{bubbles:true}));});
const observer=new MutationObserver(()=>{const root=main.querySelector('.video-centre');if(!root||!isReels(root)){document.body.classList.remove('minglora-reels-active');return;}enhance(root);});
observer.observe(main,{childList:true,subtree:true});enhance(main.querySelector('.video-centre'));
})();
