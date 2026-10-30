import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const port = 3137;
const testDataDir = path.join(os.tmpdir(), `minglora-test-${randomUUID()}`);
let server;
let cookie = '';

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {})
    }
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body, headers: response.headers };
}

test('API supports empty startup, registration, feed, posting, reactions, comments, groups and logout', async t => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PERSISTENCE_DRIVER: 'json',
      DATA_DIR: testDataDir,
      SESSION_SECRET: 'test-secret-with-enough-entropy-for-isolated-tests',
      TENOR_API_KEY: ''
    },
    stdio: 'ignore'
  });
  t.after(() => {
    server?.kill('SIGTERM');
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });

  let health;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      health = await request('/api/health');
      if (health.status === 200) break;
    } catch {}
    await delay(100);
  }
  assert.equal(health?.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.service, 'minglora-social-network');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  const readiness = await request('/api/ready');
  assert.equal(readiness.status, 200);
  assert.equal(readiness.body.components.persistence.driver, 'json');
  assert.equal(readiness.body.components.persistence.durable, false);
  assert.equal(readiness.body.components.live.provider, 'livekit');
  assert.equal(readiness.body.components.live.configured, false);

  const beforeRegistration = await request('/api/feed');
  assert.equal(beforeRegistration.status, 401);

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Minglora Test User',
      username: 'mingloratest',
      email: 'test-user@example.test',
      phoneNumber: '+18765550123',
      password: 'TestPassword123!'
    })
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.username, 'mingloratest');

  const invalidPushEndpoint = await request('/api/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'http://push.example/subscription', keys: { p256dh: 'A'.repeat(90), auth: 'B'.repeat(24) } })
  });
  assert.equal(invalidPushEndpoint.status, 400);
  const pushSubscription = await request('/api/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://push.example/subscription/test-device', keys: { p256dh: 'A'.repeat(90), auth: 'B'.repeat(24) } })
  });
  assert.equal(pushSubscription.status, 201);
  assert.equal(pushSubscription.body.subscriptions, 1);
  const removePushSubscription = await request('/api/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: 'https://push.example/subscription/test-device' })
  });
  assert.equal(removePushSubscription.status, 200);
  assert.equal(removePushSubscription.body.removed, 1);

  const malformedSessionCookie = await request('/api/feed', {
    headers: { Cookie: 'sid=%E0%A4%A' }
  });
  assert.equal(malformedSessionCookie.status, 401);

  const crossOriginWrite = await request('/api/notifications/read', {
    method: 'POST',
    headers: { Origin: 'https://attacker.example' },
    body: '{}'
  });
  assert.equal(crossOriginWrite.status, 403);

  const crossSiteWrite = await request('/api/notifications/read', {
    method: 'POST',
    headers: { 'Sec-Fetch-Site': 'cross-site' },
    body: '{}'
  });
  assert.equal(crossSiteWrite.status, 403);

  const sameOriginWrite = await request('/api/notifications/read', {
    method: 'POST',
    headers: { Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' },
    body: '{}'
  });
  assert.equal(sameOriginWrite.status, 200, JSON.stringify(sameOriginWrite.body));

  const liveStatus = await request('/api/live/status');
  assert.equal(liveStatus.status, 200);
  assert.equal(liveStatus.body.provider, 'livekit');
  assert.equal(liveStatus.body.configured, false);
  const unconfiguredLiveStart = await request('/api/live/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: 'This must not create a fake live room', visibility: 'public' })
  });
  assert.equal(unconfiguredLiveStart.status, 503);


  const invalidProfile = await request('/api/users/me', { method: 'PATCH', body: JSON.stringify({ avatar: 'javascript:alert(1)' }) });
  assert.equal(invalidProfile.status, 400);

  const defaultSettings = await request('/api/settings');
  assert.equal(defaultSettings.status, 200);
  assert.equal(defaultSettings.body.settings.privacy.profileVisibility, 'public');
  assert.equal(defaultSettings.body.settings.notifications.inApp, true);
  assert.equal(defaultSettings.body.settings.notifications.push, true);
  const savedSettings = await request('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      privacy: { profileVisibility: 'friends', allowFriendRequests: false, messageAudience: 'friends' },
      notifications: { inApp: true, messages: false },
      preferences: { theme: 'dark', feedSort: 'oldest', reducedMotion: true }
    })
  });
  assert.equal(savedSettings.status, 200, JSON.stringify(savedSettings.body));
  assert.equal(savedSettings.body.settings.privacy.profileVisibility, 'friends');
  assert.equal(savedSettings.body.settings.preferences.theme, 'dark');
  const reloadedSettings = await request('/api/settings');
  assert.equal(reloadedSettings.body.settings.privacy.allowFriendRequests, false);
  assert.equal(reloadedSettings.body.settings.notifications.messages, false);

  const firstAccountCookie = cookie;
  const privacyTestRegistration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Privacy Test User', username: 'privacytestuser', email: 'privacy-user@example.test', phoneNumber: '+18765550124', password: 'PrivacyTestPassword123!' })
  });
  assert.equal(privacyTestRegistration.status, 201);
  const hiddenProfile = await request(`/api/users/${registration.body.user.id}`);
  assert.equal(hiddenProfile.status, 404);
  const hiddenFromDiscovery = await request('/api/users');
  assert.equal(hiddenFromDiscovery.body.users.some(item => item.id === registration.body.user.id), false);
  const deniedFriendRequest = await request(`/api/friends/${registration.body.user.id}/request`, { method: 'POST', body: '{}' });
  assert.equal(deniedFriendRequest.status, 409);
  assert.match(deniedFriendRequest.body.error, /follow each other to become friends/i);
  const deniedMessage = await request('/api/messages', { method: 'POST', body: JSON.stringify({ to: registration.body.user.id, text: 'Should be blocked' }) });
  assert.equal(deniedMessage.status, 403);
  cookie = firstAccountCookie;

  const invalidSettings = await request('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ privacy: { profileVisibility: 'worldwide' } })
  });
  assert.equal(invalidSettings.status, 400);

  const retiredBase64Upload = await request('/api/media/upload', { method: 'POST', body: JSON.stringify({ slot: 'avatar', mimeType: 'image/jpeg', base64: 'AA==' }) });
  assert.equal(retiredBase64Upload.status, 410);
  const invalidResumablePrepare = await request('/api/media/upload/prepare', { method: 'POST', body: JSON.stringify({ slot: 'post', mimeType: 'image/gif', byteSize: 100 }) });
  assert.equal(invalidResumablePrepare.status, 400);
  const oversizedResumablePrepare = await request('/api/media/upload/prepare', { method: 'POST', body: JSON.stringify({ slot: 'post', mimeType: 'image/jpeg', byteSize: 500 * 1024 * 1024 + 1 }) });
  assert.equal(oversizedResumablePrepare.status, 400);

  const activeSessions = await request('/api/security/sessions');
  assert.equal(activeSessions.status, 200);
  assert.equal(activeSessions.body.sessions.some(session => session.current), true);
  const unavailableMfa = await request('/api/security/mfa');
  assert.equal(unavailableMfa.status, 200);
  assert.equal(unavailableMfa.body.available, false);
  const passwordChange = await request('/api/security/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'TestPassword123!', newPassword: 'NewTestPassword456!' })
  });
  assert.equal(passwordChange.status, 200);
  const invalidPasswordChange = await request('/api/security/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'AnotherTestPassword456!' })
  });
  assert.equal(invalidPasswordChange.status, 401);

  const supportTicket = await request('/api/support/tickets', {
    method: 'POST',
    body: JSON.stringify({ category: 'account', subject: 'Help with my account', message: 'I need help with my account settings.' })
  });
  assert.equal(supportTicket.status, 201);
  const supportReply = await request('/api/support/tickets/' + supportTicket.body.ticket.id + '/messages', {
    method: 'POST',
    body: JSON.stringify({ message: 'Here is additional information.' })
  });
  assert.equal(supportReply.status, 201);
  const supportList = await request('/api/support/tickets');
  assert.equal(supportList.status, 200);
  assert.equal(supportList.body.tickets[0].messages.length, 2);
  const supportStatus = await request('/api/support/tickets/' + supportTicket.body.ticket.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'closed' })
  });
  assert.equal(supportStatus.status, 200);

  const feed = await request('/api/feed');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.posts.length, 0);
  const emptyPage = await request('/api/feed?limit=1');
  assert.equal(emptyPage.status, 200);
  assert.equal(emptyPage.body.posts.length, 0);
  assert.equal(emptyPage.body.hasMore, false);

  const post = await request('/api/posts', {
    method: 'POST',
    body: JSON.stringify({ text: 'Automated integration test post' })
  });
  assert.equal(post.status, 201);
  assert.equal(post.body.post.text, 'Automated integration test post');

  const postReport = await request('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType: 'post', targetId: post.body.post.id, category: 'spam', details: 'Test report from automated integration.' })
  });
  assert.equal(postReport.status, 201);
  const myReports = await request('/api/reports/mine');
  assert.equal(myReports.status, 200);
  assert.equal(myReports.body.reports.some(report => report.id === postReport.body.report.id), true);
  const forbiddenModeratorQueue = await request('/api/moderation/reports');
  assert.equal(forbiddenModeratorQueue.status, 403);

  const accountExport = await request('/api/account/export');
  assert.equal(accountExport.status, 200);
  assert.equal(accountExport.body.format, 'minglora-account-export');
  assert.equal(accountExport.body.profile.id, registration.body.user.id);
  assert.equal(accountExport.body.posts.some(item => item.id === post.body.post.id), true);
  assert.equal('sessions' in accountExport.body, false);
  assert.equal('passwordHash' in accountExport.body.profile, false);
  const invalidPost = await request('/api/posts', { method: 'POST', body: JSON.stringify({ imageUrl: 'http://example.test/not-secure.jpg' }) });
  assert.equal(invalidPost.status, 400);
  const pastedHttpsImagePost = await request('/api/posts', { method: 'POST', body: JSON.stringify({ text: 'URL media is no longer allowed', imageUrl: 'https://example.test/photo.jpg' }) });
  assert.equal(pastedHttpsImagePost.status, 400);
  const feedPage = await request('/api/feed?limit=1');
  assert.equal(feedPage.status, 200);
  assert.deepEqual(feedPage.body.posts.map(item => item.id), [post.body.post.id]);
  assert.equal(feedPage.body.hasMore, false);

  const publicStory = await request('/api/stories', {
    method: 'POST',
    body: JSON.stringify({ text: 'Public story from the integration test', audience: 'public' })
  });
  assert.equal(publicStory.status, 201);
  assert.ok(Date.parse(publicStory.body.story.expiresAt) > Date.now());
  const friendsStory = await request('/api/stories', {
    method: 'POST',
    body: JSON.stringify({ text: 'Friends-only story from the integration test', audience: 'friends' })
  });
  assert.equal(friendsStory.status, 201);
  const invalidStory = await request('/api/stories', {
    method: 'POST',
    body: JSON.stringify({ imageUrl: 'http://example.test/story.jpg' })
  });
  assert.equal(invalidStory.status, 400);
  const pastedHttpsStory = await request('/api/stories', { method: 'POST', body: JSON.stringify({ imageUrl: 'https://example.test/story.jpg' }) });
  assert.equal(pastedHttpsStory.status, 400);

  const editedPost = await request(`/api/posts/${post.body.post.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ text: 'Edited integration post' })
  });
  assert.equal(editedPost.status, 200);
  assert.equal(editedPost.body.post.text, 'Edited integration post');

  const saved = await request(`/api/posts/${post.body.post.id}/save`, { method: 'POST', body: '{}' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.saved, true);
  const savedPosts = await request('/api/saved-posts');
  assert.equal(savedPosts.status, 200);
  assert.equal(savedPosts.body.posts.length, 1);
  const unsaved = await request(`/api/posts/${post.body.post.id}/save`, { method: 'DELETE', body: '{}' });
  assert.equal(unsaved.body.saved, false);

  const reaction = await request(`/api/posts/${post.body.post.id}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ reaction: 'like' })
  });
  assert.equal(reaction.status, 200);
  assert.equal(reaction.body.post.myReaction, 'like');

  const comment = await request(`/api/posts/${post.body.post.id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text: 'Automated test comment' })
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.body.comment.text, 'Automated test comment');

  const group = await request('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Community', description: 'Created by the isolated integration test' })
  });
  assert.equal(group.status, 201);
  assert.equal(group.body.group.name, 'Test Community');

  const page = await request('/api/pages', {
    method: 'POST',
    body: JSON.stringify({ handle: 'minglora-labs', title: 'Minglora Labs', description: 'Page created by the isolated integration test', category: 'Community' })
  });
  assert.equal(page.status, 201);
  assert.equal(page.body.page.myRole, 'owner');
  const duplicatePage = await request('/api/pages', {
    method: 'POST',
    body: JSON.stringify({ handle: 'MINGLORA-LABS', title: 'Duplicate Page', description: '' })
  });
  assert.equal(duplicatePage.status, 409);
  const rejectedPageImageUrl = await request(`/api/pages/${page.body.page.id}/posts`, { method: 'POST', body: JSON.stringify({ text: 'URL media must be blocked', imageUrl: 'https://example.test/page.jpg' }) });
  assert.equal(rejectedPageImageUrl.status, 400);
  const pagePost = await request(`/api/pages/${page.body.page.id}/posts`, {
    method: 'POST',
    body: JSON.stringify({ text: 'A genuine Page update' })
  });
  assert.equal(pagePost.status, 201);
  const pagePostReport=await request('/api/reports',{method:'POST',body:JSON.stringify({targetType:'post',targetId:pagePost.body.post.id,category:'spam',details:'Automated Page post moderation test.'})});
  assert.equal(pagePostReport.status,201);
  const memberPageReports=await request('/api/reports/mine');
  assert.equal(memberPageReports.body.reports.some(report=>report.id===pagePostReport.body.report.id),true);

  const firstCookie = cookie;
  const firstUserId = registration.body.user.id;
  cookie = '';
  const secondRegistration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Second Test User',
      username: 'secondtest',
      email: 'second-user@example.test',
      phoneNumber: '+18765550125',
      password: 'AnotherPassword123!'
    })
  });
  assert.equal(secondRegistration.status, 201);
  const secondUserId = secondRegistration.body.user.id;
  const secondCookie = cookie;
  cookie = firstCookie;
  const duplicateUsernameEdit = await request('/api/users/me', { method: 'PATCH', body: JSON.stringify({ username: 'secondtest' }) });
  assert.equal(duplicateUsernameEdit.status, 409);
  const usernameEdit = await request('/api/users/me', { method: 'PATCH', body: JSON.stringify({ username: 'minglora_member', name: 'Minglora Member' }) });
  assert.equal(usernameEdit.status, 200);
  assert.equal(usernameEdit.body.user.username, 'minglora_member');
  cookie = secondCookie;

  const pages = await request('/api/pages');
  assert.equal(pages.status, 200);
  assert.equal(pages.body.pages.some(item => item.id === page.body.page.id), true);
  const followPage = await request(`/api/pages/${page.body.page.id}/follow`, { method: 'POST', body: '{}' });
  assert.equal(followPage.status, 200);
  assert.equal(followPage.body.isFollowing, true);
  const pageDetail = await request(`/api/pages/${page.body.page.id}`);
  assert.equal(pageDetail.status, 200);
  assert.equal(pageDetail.body.page.followerCount, 1);
  assert.equal(pageDetail.body.page.isFollowing, true);
  assert.equal(pageDetail.body.posts.length, 1);
  const pageSearch = await request('/api/search?q=Minglora%20Labs');
  assert.equal(pageSearch.status, 200);
  assert.equal(pageSearch.body.pages.some(item => item.id === page.body.page.id), true);
  const deniedPagePublish = await request(`/api/pages/${page.body.page.id}/posts`, { method: 'POST', body: JSON.stringify({ text: 'Not an editor' }) });
  assert.equal(deniedPagePublish.status, 403);
  const deniedPagePostDelete = await request(`/api/pages/${page.body.page.id}/posts/${pagePost.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deniedPagePostDelete.status, 403);
  cookie = firstCookie;
  const ownerDeletePagePost = await request(`/api/pages/${page.body.page.id}/posts/${pagePost.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(ownerDeletePagePost.status, 200);
  const ownerCannotFollowOwnPage = await request(`/api/pages/${page.body.page.id}/follow`, { method: 'POST', body: '{}' });
  assert.equal(ownerCannotFollowOwnPage.status, 400);
  cookie = secondCookie;
  const unfollowPage = await request(`/api/pages/${page.body.page.id}/follow`, { method: 'DELETE', body: '{}' });
  assert.equal(unfollowPage.status, 200);
  assert.equal(unfollowPage.body.isFollowing, false);

  const secondStories = await request('/api/stories');
  assert.equal(secondStories.status, 200);
  assert.equal(secondStories.body.stories.some(story => story.id === publicStory.body.story.id), true);
  assert.equal(secondStories.body.stories.some(story => story.id === friendsStory.body.story.id), false);
  const deniedStoryView = await request(`/api/stories/${friendsStory.body.story.id}/view`, { method: 'POST', body: '{}' });
  assert.equal(deniedStoryView.status, 404);
  const publicStoryView = await request(`/api/stories/${publicStory.body.story.id}/view`, { method: 'POST', body: '{}' });
  assert.equal(publicStoryView.status, 200);
  assert.equal(publicStoryView.body.story.viewCount, 1);
  assert.equal(publicStoryView.body.story.viewedByMe, true);
  const deleteOtherStory = await request(`/api/stories/${publicStory.body.story.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteOtherStory.status, 403);
  cookie = firstCookie;
  const ownStoryViews = await request(`/api/stories/${publicStory.body.story.id}/view`, { method: 'POST', body: '{}' });
  assert.equal(ownStoryViews.body.story.viewCount, 1);
  assert.equal(ownStoryViews.body.story.viewers[0].user.id, secondUserId);
  cookie = secondCookie;

  const joinGroup = await request(`/api/groups/${group.body.group.id}/join`, { method: 'POST', body: '{}' });
  assert.equal(joinGroup.status, 200);
  const groupDetail = await request(`/api/groups/${group.body.group.id}`);
  assert.equal(groupDetail.status, 200);
  assert.equal(groupDetail.body.group.memberCount, 2);
  assert.equal(groupDetail.body.group.isMember, true);
  const rejectedGroupImageUrl = await request(`/api/groups/${group.body.group.id}/posts`, { method: 'POST', body: JSON.stringify({ text: 'URL media must be blocked', imageUrl: 'https://example.test/group.jpg' }) });
  assert.equal(rejectedGroupImageUrl.status, 400);
  const groupPost = await request(`/api/groups/${group.body.group.id}/posts`, {
    method: 'POST',
    body: JSON.stringify({ text: 'A real group discussion post' })
  });
  assert.equal(groupPost.status, 201);
  const groupPostReport=await request('/api/reports',{method:'POST',body:JSON.stringify({targetType:'post',targetId:groupPost.body.post.id,category:'spam',details:'Automated group post moderation test.'})});
  assert.equal(groupPostReport.status,201);
  const memberGroupReports=await request('/api/reports/mine');
  assert.equal(memberGroupReports.body.reports.some(report=>report.id===groupPostReport.body.report.id),true);
  assert.equal((await request(`/api/groups/${group.body.group.id}`)).body.posts.length, 1);
  const deleteOwnGroupPost = await request(`/api/groups/${group.body.group.id}/posts/${groupPost.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteOwnGroupPost.status, 200);
  const groupPostForOwner = await request(`/api/groups/${group.body.group.id}/posts`, {
    method: 'POST',
    body: JSON.stringify({ text: 'A post for group-owner moderation' })
  });
  assert.equal(groupPostForOwner.status, 201);
  cookie = firstCookie;
  const ownerCannotLeaveGroup = await request(`/api/groups/${group.body.group.id}/join`, { method: 'DELETE', body: '{}' });
  assert.equal(ownerCannotLeaveGroup.status, 409);
  const deleteGroupPostAsOwner = await request(`/api/groups/${group.body.group.id}/posts/${groupPostForOwner.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteGroupPostAsOwner.status, 200);
  cookie = secondCookie;
  const leaveGroup = await request(`/api/groups/${group.body.group.id}/join`, { method: 'DELETE', body: '{}' });
  assert.equal(leaveGroup.status, 200);
  const postAfterLeave = await request(`/api/groups/${group.body.group.id}/posts`, { method: 'POST', body: JSON.stringify({ text: 'Not allowed after leaving' }) });
  assert.equal(postAfterLeave.status, 403);

  const forbiddenCommentDelete = await request(`/api/posts/${post.body.post.id}/comments/${comment.body.comment.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(forbiddenCommentDelete.status, 403);
  const secondComment = await request(`/api/posts/${post.body.post.id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text: 'Comment created by the second test account' })
  });
  assert.equal(secondComment.status, 201);
  const deleteOwnComment = await request(`/api/posts/${post.body.post.id}/comments/${secondComment.body.comment.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteOwnComment.status, 200);
  const secondCommentForOwner = await request(`/api/posts/${post.body.post.id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text: 'A second account comment for post-owner moderation' })
  });
  assert.equal(secondCommentForOwner.status, 201);
  cookie = firstCookie;
  const deleteCommentAsPostOwner = await request(`/api/posts/${post.body.post.id}/comments/${secondCommentForOwner.body.comment.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteCommentAsPostOwner.status, 200);
  await request('/api/settings', { method: 'PATCH', body: JSON.stringify({ privacy: { profileVisibility: 'public', allowFriendRequests: true } }) });
  cookie = secondCookie;

  const follow = await request(`/api/users/${firstUserId}/follow`, { method: 'POST', body: '{}' });
  assert.equal(follow.status, 200);
  assert.equal(follow.body.following, true);
  const followers = await request(`/api/users/${firstUserId}/followers`);
  assert.equal(followers.body.count, 1);
  assert.equal(followers.body.users[0].id, secondUserId);
  const following = await request(`/api/users/${secondUserId}/following`);
  assert.equal(following.body.count, 1);
  assert.equal(following.body.users[0].id, firstUserId);
  const viewedProfile = await request(`/api/users/${firstUserId}`);
  assert.equal(viewedProfile.status, 200);
  assert.equal(viewedProfile.body.followersCount, 1);
  assert.equal(viewedProfile.body.followingCount, 0);

  const followingFeed = await request('/api/feed?scope=following');
  assert.equal(followingFeed.status, 200);
  assert.deepEqual(followingFeed.body.posts.map(item => item.id), [post.body.post.id]);
  assert.equal(followingFeed.body.scope, 'following');
  const friendsFeed = await request('/api/feed?scope=friends');
  assert.equal(friendsFeed.status, 200);
  assert.equal(friendsFeed.body.posts.length, 0);
  const invalidScope = await request('/api/feed?scope=secret');
  assert.equal(invalidScope.status, 400);

  const disabledFriendRequest = await request(`/api/friends/${firstUserId}/request`, { method: 'POST', body: '{}' });
  assert.equal(disabledFriendRequest.status, 409);
  assert.match(disabledFriendRequest.body.error, /follow each other to become friends/i);

  cookie = firstCookie;
  const reciprocalFollow = await request(`/api/users/${secondUserId}/follow`, { method: 'POST', body: '{}' });
  assert.equal(reciprocalFollow.status, 200);
  assert.equal(reciprocalFollow.body.following, true);
  assert.equal(reciprocalFollow.body.friends, true);

  cookie = firstCookie;
  const rejectReadBeforeConversation = await request('/api/messages/' + secondUserId + '/read', { method: 'POST', body: '{}' });
  assert.equal(rejectReadBeforeConversation.status, 404);
  const sentDirectMessage = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ to: secondUserId, text: 'Read receipt integration test.' })
  });
  assert.equal(sentDirectMessage.status, 201);
  assert.equal(sentDirectMessage.body.message.read, false);

  const senderInboxBeforeRead = await request('/api/messages');
  const senderConversation = senderInboxBeforeRead.body.conversations.find(item => item.user.id === secondUserId);
  assert.equal(senderConversation.unreadCount, 0);
  assert.equal(senderConversation.messages.at(-1).read, false);

  cookie = secondCookie;
  const recipientInboxBeforeRead = await request('/api/messages');
  const recipientConversation = recipientInboxBeforeRead.body.conversations.find(item => item.user.id === firstUserId);
  assert.equal(recipientConversation.unreadCount, 1);
  assert.equal(recipientConversation.messages.at(-1).read, false);

  const rejectSelfRead = await request('/api/messages/' + secondUserId + '/read', { method: 'POST', body: '{}' });
  assert.equal(rejectSelfRead.status, 400);
  const markConversationRead = await request('/api/messages/' + firstUserId + '/read', { method: 'POST', body: '{}' });
  assert.equal(markConversationRead.status, 200);
  assert.equal(markConversationRead.body.updated, 1);
  assert.ok(markConversationRead.body.readAt);

  const recipientInboxAfterRead = await request('/api/messages');
  const readConversation = recipientInboxAfterRead.body.conversations.find(item => item.user.id === firstUserId);
  assert.equal(readConversation.unreadCount, 0);
  assert.equal(readConversation.messages.at(-1).read, true);
  assert.ok(readConversation.messages.at(-1).readAt);

  cookie = firstCookie;
  const senderInboxAfterRead = await request('/api/messages');
  const senderReadConversation = senderInboxAfterRead.body.conversations.find(item => item.user.id === secondUserId);
  assert.equal(senderReadConversation.messages.at(-1).read, true);
  assert.ok(senderReadConversation.messages.at(-1).readAt);

  cookie = secondCookie;
  const unknownConversationRead = await request('/api/messages/not-a-real-member/read', { method: 'POST', body: '{}' });
  assert.equal(unknownConversationRead.status, 404);

  const stickerMessage = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ to: firstUserId, stickerId: 'heart' })
  });
  assert.equal(stickerMessage.status, 201);
  assert.equal(stickerMessage.body.message.stickerId, 'heart');
  assert.equal(stickerMessage.body.message.text, '💖');

  const invalidSticker = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ to: firstUserId, stickerId: 'not-a-real-sticker' })
  });
  assert.equal(invalidSticker.status, 400);

  const unsafeGif = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ to: firstUserId, gifUrl: 'https://not-tenor.example/file.gif' })
  });
  assert.equal(unsafeGif.status, 400);

  const unconfiguredGifSearch = await request('/api/messages/gifs?q=funny');
  assert.equal(unconfiguredGifSearch.status, 503);

  cookie = firstCookie;
  const mutualFriends = await request('/api/friends');
  assert.equal(mutualFriends.body.friends.some(member => member.id === secondUserId), true);
  const reciprocalFollowing = await request(`/api/users/${firstUserId}/following`);
  assert.equal(reciprocalFollowing.body.users.some(member => member.id === secondUserId), true);
  const profileFriends = await request(`/api/users/${firstUserId}/friends`);
  assert.equal(profileFriends.body.users.some(member => member.id === secondUserId), true);
  const friendsCountProfile = await request(`/api/users/${firstUserId}`);
  assert.equal(friendsCountProfile.body.friendsCount, 1);

  cookie = secondCookie;
  const friendsStoryAfterMutualFollow = await request('/api/stories');
  assert.equal(friendsStoryAfterMutualFollow.body.stories.some(story => story.id === friendsStory.body.story.id), true);
  const friendStoryView = await request(`/api/stories/${friendsStory.body.story.id}/view`, { method: 'POST', body: '{}' });
  assert.equal(friendStoryView.status, 200);
  cookie = firstCookie;
  const deleteOwnStory = await request(`/api/stories/${friendsStory.body.story.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteOwnStory.status, 200);
  cookie = secondCookie;
  const friendsFeedAfterMutualFollow = await request('/api/feed?scope=friends');
  assert.deepEqual(friendsFeedAfterMutualFollow.body.posts.map(item => item.id), [post.body.post.id]);

  const unfollow = await request(`/api/users/${firstUserId}/follow`, { method: 'DELETE', body: '{}' });
  assert.equal(unfollow.status, 200);
  assert.equal(unfollow.body.friends, false);
  assert.equal((await request('/api/feed?scope=friends')).body.posts.length, 0);
  const noLongerFriends = await request('/api/users');
  assert.equal(noLongerFriends.body.users.find(member => member.id === firstUserId)?.friendship, null);

  cookie = secondCookie;
  const mutualFollowAgain = await request(`/api/users/${firstUserId}/follow`, { method: 'POST', body: '{}' });
  assert.equal(mutualFollowAgain.status, 200);
  assert.equal(mutualFollowAgain.body.friends, true);
  cookie = secondCookie;

  const forbiddenEdit = await request(`/api/posts/${post.body.post.id}`, { method: 'PATCH', body: JSON.stringify({ text: 'Not the owner' }) });
  assert.equal(forbiddenEdit.status, 403);
  const forbiddenDelete = await request(`/api/posts/${post.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(forbiddenDelete.status, 403);

  const otherSave = await request(`/api/posts/${post.body.post.id}/save`, { method: 'POST', body: '{}' });
  assert.equal(otherSave.body.saved, true);
  assert.equal((await request('/api/saved-posts')).body.posts.length, 1);

  const block = await request(`/api/users/${firstUserId}/block`, { method: 'POST', body: '{}' });
  assert.equal(block.body.blocked, true);
  assert.equal((await request('/api/feed')).body.posts.length, 0);
  assert.equal((await request(`/api/users/${firstUserId}`)).status, 404);
  assert.equal((await request('/api/blocks')).body.users.length, 1);
  const blockedMessage = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ to: firstUserId, text: 'This should be rejected while blocked.' })
  });
  assert.equal(blockedMessage.status, 400);

  const unblock = await request(`/api/users/${firstUserId}/block`, { method: 'DELETE', body: '{}' });
  assert.equal(unblock.body.blocked, false);
  assert.equal((await request(`/api/users/${firstUserId}`)).status, 200);
  const refollow = await request(`/api/users/${firstUserId}/follow`, { method: 'POST', body: '{}' });
  assert.equal(refollow.body.following, true);
  assert.equal((await request(`/api/users/${firstUserId}/followers`)).body.count, 1);

  cookie = firstCookie;
  const deleteOwnPost = await request(`/api/posts/${post.body.post.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deleteOwnPost.status, 200);
  cookie = secondCookie;
  assert.equal((await request('/api/saved-posts')).body.posts.length, 0);

  cookie = firstCookie;
  cookie = firstCookie;
  const deletePage = await request(`/api/pages/${page.body.page.id}`, { method: 'DELETE', body: '{}' });
  assert.equal(deletePage.status, 200);
  cookie = secondCookie;
  assert.equal((await request(`/api/pages/${page.body.page.id}`)).status, 404);

  cookie = firstCookie;
  const deactivate = await request('/api/account/deactivate', {
    method: 'POST',
    body: JSON.stringify({ confirmation: 'DEACTIVATE' })
  });
  assert.equal(deactivate.status, 200);
  assert.equal((await request('/api/feed')).status, 401);
  cookie = '';
  const reactivateLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'test-user@example.test', password: 'NewTestPassword456!' })
  });
  assert.equal(reactivateLogin.status, 200, JSON.stringify(reactivateLogin.body));
  assert.equal((await request('/api/feed')).status, 200);

  const deletionRequest = await request('/api/account/deletion-request', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'NewTestPassword456!' })
  });
  assert.equal(deletionRequest.status, 202);
  assert.equal(deletionRequest.body.request.requestType, 'deletion');
  const duplicateDeletionRequest = await request('/api/account/deletion-request', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'NewTestPassword456!' })
  });
  assert.equal(duplicateDeletionRequest.status, 202);
  assert.equal(duplicateDeletionRequest.body.request.id, deletionRequest.body.request.id);

  const logout = await request('/api/auth/logout', { method: 'POST', body: '{}' });
  assert.equal(logout.status, 200);
  cookie = '';
  const protectedFeed = await request('/api/feed');
  assert.equal(protectedFeed.status, 401);
});
