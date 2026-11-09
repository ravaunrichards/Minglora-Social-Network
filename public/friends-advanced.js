/* Minglora Friends — Facebook-style people cards and automatic mutual-follow friendships.
   Friends exist only when both members follow each other. There are no friend requests. */
let friendsDashboardState = {
  tab: 'all',
  query: '',
  lists: [],
  friends: [],
  people: [],
  selectedListId: null,
  loading: false
};

const FRIENDS_DASHBOARD_TABS = [
  ['all','All friends','people'],
  ['recent','Recently added','clock'],
  ['mutual','Mutual friends','users'],
  ['favorites','Favorites','heart'],
  ['close','Close Friends','star'],
  ['restricted','Restricted','lock'],
  ['lists','Custom lists','list'],
  ['suggestions','People you may know','user-plus']
];

function friendsDashboardActiveTab(tab) {
  friendsDashboardState.tab = tab;
  if (tab !== 'lists') friendsDashboardState.selectedListId = null;
}

function friendsDashboardMutualMarkup(member) {
  const previews=(Array.isArray(member.mutualFriendsPreview)?member.mutualFriendsPreview:[]).slice(0,3);
  const count=Math.max(0,Number(member.mutualFriendsCount||0));
  const icons=previews.length
    ?'<span class="facebook-mutual-stack" aria-hidden="true">'+previews.map(friend=>'<img src="'+esc(avatar(friend))+'" alt="" loading="lazy">').join('')+'</span>'
    :'<span class="facebook-mutual-empty" aria-hidden="true">♧</span>';
  return '<div class="facebook-friend-mutual">'+icons+'<span>'+(count?count.toLocaleString()+' mutual '+(count===1?'friend':'friends'):'No mutual friends')+'</span></div>';
}

function friendsDashboardVisibleFriends() {
  const query=friendsDashboardState.query.trim().toLowerCase().replace(/^@/,'');
  let rows=[...friendsDashboardState.friends];
  if(friendsDashboardState.tab==='recent') rows.sort((a,b)=>Date.parse(b.friendSince||0)-Date.parse(a.friendSince||0));
  if(friendsDashboardState.tab==='mutual') rows=rows.filter(member=>Number(member.mutualFriendsCount||0)>0);
  if(friendsDashboardState.tab==='favorites') rows=rows.filter(member=>member.isFavorite===true);
  if(friendsDashboardState.tab==='close') rows=rows.filter(member=>member.isCloseFriend===true);
  if(friendsDashboardState.tab==='restricted') rows=rows.filter(member=>member.isRestricted===true);
  if(friendsDashboardState.tab==='lists'&&friendsDashboardState.selectedListId) {
    const list=friendsDashboardState.lists.find(item=>item.id===friendsDashboardState.selectedListId);
    const ids=new Set(list?.memberIds||[]);
    rows=rows.filter(member=>ids.has(member.id));
  }
  if(query) rows=rows.filter(member=>(String(member.name||'')+' '+String(member.username||'')).toLowerCase().includes(query));
  return rows;
}

function friendsDashboardCard(member,listId=null) {
  const close=member.isCloseFriend===true;
  const restricted=member.isRestricted===true;
  const favorite=member.isFavorite===true;
  const mutedPosts=member.isMutedPosts===true;
  const mutedStories=member.isMutedStories===true;
  const snoozed=Boolean(member.snoozedUntil&&Date.parse(member.snoozedUntil)>Date.now());
  const previews=Array.isArray(member.mutualFriendsPreview)?member.mutualFriendsPreview:[];
  const actions=listId
    ?'<button type="button" class="facebook-friend-remove-list" data-remove-friend-list="'+esc(listId)+'" data-member-id="'+esc(member.id)+'">Remove from list</button>'
    :'<select class="facebook-friend-list-select" aria-label="Add '+esc(member.name)+' to a custom list" data-friend-list-select="'+esc(member.id)+'"><option value="">Add to list…</option>'+friendsDashboardState.lists.map(list=>'<option value="'+esc(list.id)+'">'+esc(list.name)+'</option>').join('')+'</select>';
  return '<article class="friend-manager-card facebook-friend-card">'+
    '<button type="button" class="facebook-friend-photo" data-friend-view="'+esc(member.id)+'" aria-label="View '+esc(member.name)+' profile"><img src="'+esc(avatar(member))+'" alt="" loading="lazy"></button>'+
    '<div class="facebook-friend-body">'+
      '<div class="facebook-friend-name-line"><button type="button" class="facebook-friend-name" data-friend-view="'+esc(member.id)+'">'+esc(member.name)+' '+verifiedProfileBadge(member)+'</button></div>'+
      '<div class="facebook-friend-username">@'+esc(member.username||'')+'</div>'+
      friendsDashboardMutualMarkup(member)+
      '<div class="facebook-friend-status">'+(close?'<span class="facebook-friend-status-close" title="Close Friends"><span aria-hidden="true">★</span> Close Friends</span>':'')+(restricted?'<span class="facebook-friend-status-restricted" title="Restricted"><span aria-hidden="true">🔒</span> Restricted</span>':'')+'</div>'+
      '<div class="facebook-friend-actions">'+
        '<button type="button" class="facebook-friend-view" data-friend-view="'+esc(member.id)+'">View profile</button>'+
        '<button type="button" class="facebook-friend-message" data-friend-message="'+esc(member.id)+'">Message</button>'+
      '</div>'+
      '<div class="facebook-friend-preferences">'+
        '<button type="button" class="facebook-friend-pref '+(close?'is-active':'')+'" data-friend-pref="'+esc(member.id)+'" data-pref-key="isCloseFriend" data-pref-value="'+(!close)+'" aria-pressed="'+close+'"><span aria-hidden="true">★</span> '+(close?'Close Friends':'Add to Close Friends')+'</button>'+
        '<button type="button" class="facebook-friend-pref '+(restricted?'is-active':'')+'" data-friend-pref="'+esc(member.id)+'" data-pref-key="isRestricted" data-pref-value="'+(!restricted)+'" aria-pressed="'+restricted+'"><span aria-hidden="true">🔒</span> '+(restricted?'Restricted':'Add to Restricted')+'</button>'+
        '<button type="button" class="facebook-friend-pref '+(favorite?'is-active':'')+'" data-friend-pref="'+esc(member.id)+'" data-pref-key="isFavorite" data-pref-value="'+(!favorite)+'" aria-pressed="'+favorite+'"><span aria-hidden="true">♥</span> '+(favorite?'Favorite':'Add favorite')+'</button>'+
        '<button type="button" class="facebook-friend-pref '+(mutedPosts?'is-active':'')+'" data-friend-pref="'+esc(member.id)+'" data-pref-key="isMutedPosts" data-pref-value="'+(!mutedPosts)+'" aria-pressed="'+mutedPosts+'">'+(mutedPosts?'Unmute posts':'Mute posts')+'</button>'+
        '<button type="button" class="facebook-friend-pref '+(mutedStories?'is-active':'')+'" data-friend-pref="'+esc(member.id)+'" data-pref-key="isMutedStories" data-pref-value="'+(!mutedStories)+'" aria-pressed="'+mutedStories+'">'+(mutedStories?'Unmute stories':'Mute stories')+'</button>'+
        '<button type="button" class="facebook-friend-pref '+(snoozed?'is-active':'')+'" data-friend-snooze="'+esc(member.id)+'" data-snoozed="'+snoozed+'" aria-pressed="'+snoozed+'">'+(snoozed?'End snooze':'Snooze 7 days')+'</button>'+
      '</div>'+
      '<div class="facebook-friend-list-actions">'+actions+
        '<button type="button" class="facebook-friend-remove" data-unfollow-friend="'+esc(member.id)+'">Remove</button>'+
      '</div>'+
    '</div>'+
  '</article>';
}

function friendsDashboardListCards() {
  const builtins=[
    {id:'close',name:'Close Friends',icon:'★',count:friendsDashboardState.friends.filter(member=>member.isCloseFriend).length},
    {id:'restricted',name:'Restricted',icon:'🔒',count:friendsDashboardState.friends.filter(member=>member.isRestricted).length}
  ];
  return '<div class="facebook-friend-list-grid">'+
    builtins.map(item=>'<button type="button" class="facebook-friend-list-tile" data-open-built-in-list="'+item.id+'"><span class="facebook-friend-list-icon facebook-friend-list-icon--'+item.id+'" aria-hidden="true">'+item.icon+'</span><span><strong>'+item.name+'</strong><small>'+item.count.toLocaleString()+' friends</small></span><span class="facebook-friend-list-arrow" aria-hidden="true">›</span></button>').join('')+
    friendsDashboardState.lists.map(list=>'<article class="facebook-friend-list-tile"><span class="facebook-friend-list-icon" aria-hidden="true">☷</span><span><strong>'+esc(list.name)+'</strong><small>'+Number(list.memberCount||0).toLocaleString()+' friends</small></span><button type="button" class="facebook-friend-list-open" data-open-friend-list="'+esc(list.id)+'">Open</button></article>').join('')+
    '</div>';
}

function friendsDashboardTabMarkup() {
  return '<nav class="facebook-friends-tabs" aria-label="Friends categories">'+FRIENDS_DASHBOARD_TABS.map(([key,label,icon])=>
    '<button type="button" data-friends-tab="'+key+'" class="'+(friendsDashboardState.tab===key?'is-active':'')+'" aria-current="'+(friendsDashboardState.tab===key?'page':'false')+'"><span aria-hidden="true">'+({people:'♧',clock:'◷',users:'♧',heart:'♥',star:'★',lock:'🔒',list:'☷','user-plus':'＋'}[icon])+'</span>'+label+'</button>'
  ).join('')+'</nav>';
}

function friendsDashboardMainMarkup() {
  const tab=friendsDashboardState.tab;
  if(tab==='suggestions') {
    return '<section class="facebook-friends-section"><div class="facebook-friends-section-heading"><h2>People you may know</h2></div><div id="people-discovery-grid" class="people-grid people-discovery-grid">'+peopleGridMarkup()+'</div></section>';
  }
  if(tab==='lists'&&!friendsDashboardState.selectedListId) {
    return '<section class="facebook-friends-section"><div class="facebook-friends-section-heading"><div><h2>Your lists</h2><p>Keep your friends organised with private custom lists.</p></div><button type="button" class="primary" id="friends-create-list">＋ Create list</button></div>'+friendsDashboardListCards()+'</section>';
  }
  let title='All friends',listId=null;
  if(tab==='recent')title='Recently Added';
  if(tab==='mutual')title='Mutual Friends';
  if(tab==='favorites')title='Favorites';
  if(tab==='close')title='Close Friends';
  if(tab==='restricted')title='Restricted';
  if(tab==='lists') {
    const list=friendsDashboardState.lists.find(item=>item.id===friendsDashboardState.selectedListId);
    title=list?.name||'Custom list';
    listId=friendsDashboardState.selectedListId;
  }
  const rows=friendsDashboardVisibleFriends();
  const tools=listId
    ?'<div class="facebook-friends-section-tools"><button type="button" id="friends-back-lists">← All lists</button><button type="button" id="friends-rename-list">Rename</button><button type="button" id="friends-delete-list" class="is-danger">Delete list</button></div>'
    :'';
  return '<section class="facebook-friends-section"><div class="facebook-friends-section-heading"><div><h2>'+title+'</h2><p>'+rows.length.toLocaleString()+' '+(rows.length===1?'friend':'friends')+'</p></div>'+tools+'</div>'+
    (rows.length?'<div class="friends-advanced-grid facebook-friend-grid">'+rows.map(member=>friendsDashboardCard(member,listId)).join('')+'</div>':'<div class="friends-empty facebook-friends-empty"><h3>'+(tab==='close'?'No Close Friends yet':tab==='restricted'?'No restricted friends':'No friends to show')+'</h3><p>Friends appear here automatically when you and another member follow each other.</p></div>')+
  '</section>';
}

function friendsDashboardPaint() {
  const friendCount=friendsDashboardState.friends.length;
  const showSearch=friendsDashboardState.tab!=='suggestions'&&!(friendsDashboardState.tab==='lists'&&!friendsDashboardState.selectedListId);
  const search=showSearch?'<label class="facebook-friends-search"><span aria-hidden="true">⌕</span><input id="friends-advanced-search" type="search" placeholder="Search friends" value="'+esc(friendsDashboardState.query)+'" aria-label="Search friends"></label>':'';
  setContent('<div class="friends-advanced facebook-friends-page">'+
    '<header class="facebook-friends-head"><div><h1>Friends</h1><p>'+friendCount.toLocaleString()+' '+(friendCount===1?'friend':'friends')+'</p></div></header>'+
    friendsDashboardTabMarkup()+
    '<div class="facebook-friends-toolbar">'+search+'</div>'+
    friendsDashboardMainMarkup()+
    '<p class="facebook-friends-note">Minglora friendships are automatic: following each other makes you friends. There are no friend requests.</p>'+
  '</div>');
  friendsDashboardBind();
}

function friendsDashboardBind() {
  const root=document.getElementById('main-content');
  if(!root)return;
  root.querySelectorAll('[data-friends-tab]').forEach(button=>button.addEventListener('click',()=>{
    friendsDashboardActiveTab(button.dataset.friendsTab);
    friendsDashboardPaint();
  }));
  const search=root.querySelector('#friends-advanced-search');
  if(search)search.addEventListener('input',()=>{
    friendsDashboardState.query=search.value;
    const position=search.selectionStart;
    friendsDashboardPaint();
    const next=document.getElementById('friends-advanced-search');
    if(next){next.focus();next.setSelectionRange(position,position);}
  });
  root.querySelector('#friends-create-list')?.addEventListener('click',friendsDashboardCreateList);
  root.querySelectorAll('[data-open-built-in-list]').forEach(button=>button.addEventListener('click',()=>{
    friendsDashboardState.tab=button.dataset.openBuiltInList;
    friendsDashboardState.selectedListId=null;
    friendsDashboardPaint();
  }));
  root.querySelectorAll('[data-open-friend-list]').forEach(button=>button.addEventListener('click',()=>{
    friendsDashboardState.tab='lists';
    friendsDashboardState.selectedListId=button.dataset.openFriendList;
    friendsDashboardPaint();
  }));
  root.querySelector('#friends-back-lists')?.addEventListener('click',()=>{
    friendsDashboardState.selectedListId=null;
    friendsDashboardPaint();
  });
  root.querySelector('#friends-rename-list')?.addEventListener('click',friendsDashboardRenameList);
  root.querySelector('#friends-delete-list')?.addEventListener('click',friendsDashboardDeleteList);
  root.querySelectorAll('[data-friend-view]').forEach(button=>button.addEventListener('click',()=>openProfile(button.dataset.friendView)));
  root.querySelectorAll('[data-friend-message]').forEach(button=>button.addEventListener('click',()=>{
    const member=friendsDashboardState.friends.find(item=>item.id===button.dataset.friendMessage);
    if(member)openMessageWindow(member);
  }));
  root.querySelectorAll('[data-friend-pref]').forEach(button=>button.addEventListener('click',()=>friendsDashboardUpdatePreference(
    button.dataset.friendPref,button.dataset.prefKey,button.dataset.prefValue==='true'
  )));
  root.querySelectorAll('[data-friend-snooze]').forEach(button=>button.addEventListener('click',()=>{
    const clearing=button.dataset.snoozed==='true';
    const until=clearing?null:new Date(Date.now()+7*24*60*60*1000).toISOString();
    friendsDashboardUpdatePreference(button.dataset.friendSnooze,'snoozedUntil',until);
  }));
  root.querySelectorAll('[data-friend-list-select]').forEach(select=>select.addEventListener('change',async()=>{
    if(!select.value)return;
    await friendsDashboardChangeListMember(select.value,select.dataset.friendListSelect,true);
    select.value='';
  }));
  root.querySelectorAll('[data-remove-friend-list]').forEach(button=>button.addEventListener('click',()=>friendsDashboardChangeListMember(
    button.dataset.removeFriendList,button.dataset.memberId,false
  )));
  root.querySelectorAll('[data-unfollow-friend]').forEach(button=>button.addEventListener('click',async()=>{
    const member=friendsDashboardState.friends.find(item=>item.id===button.dataset.unfollowFriend);
    if(!member||!window.confirm('Remove '+member.name+' from your friends? Unfollowing ends the friendship unless they still follow you.'))return;
    button.disabled=true;
    try{
      await api('/users/'+encodeURIComponent(member.id)+'/follow',{method:'DELETE',body:'{}'});
      toast('Friend removed.');
      await renderFriends();
    }catch(error){toast(error.message);button.disabled=false;}
  }));
  const suggestions=root.querySelector('#people-discovery-grid');
  if(suggestions)bindPeople(suggestions);
}

async function friendsDashboardCreateList() {
  const name=window.prompt('Name your custom friend list:');
  if(name===null)return;
  const clean=name.trim().replace(/\s+/g,' ');
  if(!clean)return toast('Enter a list name.');
  try{
    const result=await api('/friends/lists',{method:'POST',body:JSON.stringify({name:clean})});
    friendsDashboardState.lists=[...friendsDashboardState.lists,result.list];
    friendsDashboardState.selectedListId=result.list.id;
    friendsDashboardState.tab='lists';
    toast('Custom list created.');
    friendsDashboardPaint();
  }catch(error){toast(error.message);}
}

async function friendsDashboardRenameList() {
  const list=friendsDashboardState.lists.find(item=>item.id===friendsDashboardState.selectedListId);
  if(!list)return;
  const name=window.prompt('Rename this list:',list.name);
  if(name===null)return;
  try{
    const result=await api('/friends/lists/'+encodeURIComponent(list.id),{method:'PATCH',body:JSON.stringify({name})});
    list.name=result.list?.name||name.trim();
    toast('List renamed.');
    friendsDashboardPaint();
  }catch(error){toast(error.message);}
}

async function friendsDashboardDeleteList() {
  const list=friendsDashboardState.lists.find(item=>item.id===friendsDashboardState.selectedListId);
  if(!list||!window.confirm('Delete the custom list "'+list.name+'"? Friendships will not be affected.'))return;
  try{
    await api('/friends/lists/'+encodeURIComponent(list.id),{method:'DELETE',body:'{}'});
    friendsDashboardState.lists=friendsDashboardState.lists.filter(item=>item.id!==list.id);
    friendsDashboardState.selectedListId=null;
    toast('List deleted.');
    friendsDashboardPaint();
  }catch(error){toast(error.message);}
}

async function friendsDashboardChangeListMember(listId,memberId,add) {
  try{
    const result=await api('/friends/lists/'+encodeURIComponent(listId)+'/members/'+encodeURIComponent(memberId),{
      method:add?'PUT':'DELETE',body:'{}'
    });
    const list=friendsDashboardState.lists.find(item=>item.id===listId);
    if(list){
      const ids=new Set(list.memberIds||[]);
      if(add)ids.add(memberId);else ids.delete(memberId);
      list.memberIds=[...ids];
      list.memberCount=Number(result.memberCount||list.memberIds.length);
    }
    toast(add?'Added to custom list.':'Removed from custom list.');
    friendsDashboardPaint();
  }catch(error){toast(error.message);}
}

async function friendsDashboardUpdatePreference(memberId,key,value) {
  try{
    const result=await api('/friends/'+encodeURIComponent(memberId)+'/preferences',{
      method:'PATCH',body:JSON.stringify({[key]:value})
    });
    const member=friendsDashboardState.friends.find(item=>item.id===memberId);
    if(member)Object.assign(member,result.preferences);
    toast(key==='isRestricted'?(value?'Added to Restricted.':'Removed from Restricted.'):key==='isCloseFriend'?(value?'Added to Close Friends.':'Removed from Close Friends.'):'Friend preferences updated.');
    friendsDashboardPaint();
  }catch(error){toast(error.message);}
}

async function renderFriends() {
  activateSilent('friends');
  if(typeof stopPeopleDiscoveryRefresh==='function')stopPeopleDiscoveryRefresh();
  friendsDashboardState.loading=true;
  try{
    const [friendResult,listResult,discoveryResult,liveResult]=await Promise.all([
      api('/friends/manage'),
      api('/friends/lists'),
      api('/discovery/people'),
      api('/live/sessions').catch(()=>({sessions:[]}))
    ]);
    friendsDashboardState.friends=friendResult.friends||[];
    friendsDashboardState.lists=listResult.lists||[];
    state.people=discoveryResult.users||[];
    state.discoveryLiveSessions=liveResult.sessions||[];
    if(friendsDashboardState.selectedListId&&!friendsDashboardState.lists.some(list=>list.id===friendsDashboardState.selectedListId)){
      friendsDashboardState.selectedListId=null;
    }
    friendsDashboardState.loading=false;
    friendsDashboardPaint();
  }catch(error){
    friendsDashboardState.loading=false;
    setContent('<section class="card friends-empty"><h3>Friends could not be loaded</h3><p>'+esc(error.message||'Please try again.')+'</p><button class="primary" id="friends-retry" type="button">Retry</button></section>');
    document.getElementById('friends-retry')?.addEventListener('click',()=>renderFriends());
  }
}
