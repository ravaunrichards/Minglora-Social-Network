import test from 'node:test';
import assert from 'node:assert/strict';
import { rankForYouFeed } from '../../src/domain/feed-ranking.js';

const now = Date.parse('2026-11-04T19:00:00.000Z');
const post = (id,userId,extra={})=>({
  id,userId,createdAt:new Date(now-3600000).toISOString(),
  reactions:{},comments:[],mediaIds:[],...extra
});

test('For You favors followed creators and creators a member has engaged with',()=>{
  const posts=[
    post('cold','unfamiliar'),
    post('followed','followed',{reactions:{viewer:'like'}}),
    post('saved','saved-author')
  ];
  const ranked=rankForYouFeed(
    posts,'viewer',
    [{followerId:'viewer',followedId:'followed'}],
    [{userId:'viewer',postId:'saved'}],
    now
  );
  assert.ok(ranked.findIndex(item=>item.id==='followed')<ranked.findIndex(item=>item.id==='cold'));
  assert.ok(ranked.findIndex(item=>item.id==='saved')<ranked.findIndex(item=>item.id==='cold'));
});

test('For You interleaves creators instead of repeating one prolific account',()=>{
  const posts=[
    post('a1','creator-a',{reactions:Object.fromEntries(Array.from({length:50},(_,i)=>['u'+i,'like']))}),
    post('a2','creator-a',{reactions:Object.fromEntries(Array.from({length:40},(_,i)=>['v'+i,'like']))}),
    post('b1','creator-b'),
    post('c1','creator-c')
  ];
  const ranked=rankForYouFeed(posts,'viewer',[],[],now);
  assert.deepEqual(ranked.slice(0,3).map(item=>item.id),['a1','b1','c1']);
  assert.equal(ranked.length,posts.length);
});
