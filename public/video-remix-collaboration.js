(() => {
  'use strict';

  const api = (path, options = {}) => {
    if (typeof window.api !== 'function') throw new Error('Minglora is still loading. Try again.');
    return window.api(path, options);
  };
  const notify = message => {
    if (typeof window.toast === 'function') window.toast(message);
  };
  const refresh = async () => {
    if (typeof window.refreshVisiblePosts === 'function') await window.refreshVisiblePosts();
  };
  const makeModal = (title, description = '') => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop video-collaboration-backdrop';
    const modal = document.createElement('section');
    modal.className = 'modal video-collaboration-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', title);
    const header = document.createElement('div');
    header.className = 'modal-head';
    const heading = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = title;
    heading.append(h2);
    if (description) {
      const copy = document.createElement('p');
      copy.className = 'muted';
      copy.textContent = description;
      heading.append(copy);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => backdrop.remove());
    header.append(heading, close);
    const body = document.createElement('div');
    body.className = 'modal-body video-collaboration-body';
    modal.append(header, body);
    backdrop.append(modal);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) backdrop.remove();
    });
    document.body.append(backdrop);
    return { backdrop, modal, body };
  };
  const addField = (form, labelText, control) => {
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.textContent = labelText;
    if (control.id) label.htmlFor = control.id;
    field.append(label, control);
    form.append(field);
    return field;
  };
  const actionButton = (text, className = 'primary') => {
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = className;
    button.textContent = text;
    return button;
  };

  async function editRemixPermissions(postId) {
    const post = typeof window.findVisiblePost === 'function' ? window.findVisiblePost(postId) : null;
    if (!post) return notify('This video is no longer available.');
    const { backdrop, body } = makeModal('Remix permissions', 'Choose who can create a new video that credits this original post.');
    const form = document.createElement('form');
    form.className = 'video-collaboration-form';
    const select = document.createElement('select');
    select.id = 'video-remix-permission-choice';
    for (const [value, label] of [['off', 'Nobody — off'], ['everyone', 'Everyone'], ['followers', 'My followers'], ['friends', 'My friends']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = ['off', 'everyone', 'followers', 'friends'].includes(post.remixPolicy) ? post.remixPolicy : 'off';
    addField(form, 'Who can remix this video?', select);
    const note = document.createElement('p');
    note.className = 'video-collaboration-note';
    note.textContent = 'Changing this setting never exposes a private video. People must still be allowed to view the original post. Your original upload is never replaced.';
    form.append(note);
    const submit = actionButton('Save permissions');
    form.append(submit);
    body.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await api('/posts/' + encodeURIComponent(postId) + '/remix-settings', {
          method: 'PATCH', body: JSON.stringify({ policy: select.value })
        });
        backdrop.remove();
        notify('Remix permissions saved.');
        await refresh();
      } catch (error) {
        notify(error.message || 'Remix permissions could not be saved.');
        submit.disabled = false;
      }
    });
  }

  async function inviteCollaborator(postId) {
    const post = typeof window.findVisiblePost === 'function' ? window.findVisiblePost(postId) : null;
    if (!post) return notify('This video is no longer available.');
    const { body } = makeModal('Invite a video collaborator', 'Invite one of your Minglora friends. They must accept before their name appears as a collaborator.');
    const form = document.createElement('form');
    form.className = 'video-collaboration-form';
    const username = document.createElement('input');
    username.id = 'video-collaborator-username';
    username.name = 'username';
    username.autocomplete = 'off';
    username.maxLength = 33;
    username.placeholder = '@username';
    username.required = true;
    addField(form, 'Friend’s username', username);
    const note = document.createElement('p');
    note.className = 'video-collaboration-note';
    note.textContent = 'Only mutual-follow friends who can view this video can be invited. Up to five accepted or pending collaborators are allowed per video.';
    form.append(note);
    const submit = actionButton('Send invitation');
    form.append(submit);
    body.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      try {
        const result = await api('/posts/' + encodeURIComponent(postId) + '/collaborators', {
          method: 'POST', body: JSON.stringify({ username: username.value.trim() })
        });
        backdropRemove(body);
        notify(result.alreadyInvited ? 'That friend already has an invitation.' : 'Collaboration invitation sent.');
        await refresh();
      } catch (error) {
        notify(error.message || 'The invitation could not be sent.');
        submit.disabled = false;
      }
    });
  }

  function backdropRemove(body) {
    body.closest('.video-collaboration-backdrop')?.remove();
  }

  async function showInvitations() {
    const { body } = makeModal('Video collaboration invitations', 'Accept an invitation to be credited as a collaborator on a friend’s video.');
    const loading = document.createElement('p');
    loading.className = 'muted';
    loading.textContent = 'Loading invitations…';
    body.append(loading);
    try {
      const result = await api('/video-collaborations/invitations');
      loading.remove();
      const invitations = Array.isArray(result.invitations) ? result.invitations : [];
      if (!invitations.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'You have no pending video collaboration invitations.';
        body.append(empty);
        return;
      }
      for (const invitation of invitations) {
        const card = document.createElement('article');
        card.className = 'video-collaboration-invitation';
        const title = document.createElement('strong');
        title.textContent = (invitation.creator?.name || 'A Minglora friend') + ' invited you';
        const copy = document.createElement('p');
        copy.textContent = invitation.post?.text || 'Video collaboration';
        const actions = document.createElement('div');
        actions.className = 'video-collaboration-actions';
        const accept = document.createElement('button');
        accept.type = 'button';
        accept.className = 'primary';
        accept.textContent = 'Accept';
        const decline = document.createElement('button');
        decline.type = 'button';
        decline.className = 'secondary';
        decline.textContent = 'Decline';
        const respond = async (response, button) => {
          accept.disabled = true;
          decline.disabled = true;
          button.textContent = response === 'accept' ? 'Accepting…' : 'Declining…';
          try {
            await api('/video-collaborations/invitations/' + encodeURIComponent(invitation.id) + '/respond', {
              method: 'POST', body: JSON.stringify({ response })
            });
            card.remove();
            notify(response === 'accept' ? 'You accepted the collaboration invitation.' : 'Invitation declined.');
            if (!body.querySelector('.video-collaboration-invitation')) {
              const empty = document.createElement('div');
              empty.className = 'empty-state';
              empty.textContent = 'You have no pending video collaboration invitations.';
              body.append(empty);
            }
            await refresh();
          } catch (error) {
            accept.disabled = false;
            decline.disabled = false;
            button.textContent = response === 'accept' ? 'Accept' : 'Decline';
            notify(error.message || 'The invitation could not be updated.');
          }
        };
        accept.addEventListener('click', () => respond('accept', accept));
        decline.addEventListener('click', () => respond('decline', decline));
        actions.append(accept, decline);
        card.append(title, copy, actions);
        body.append(card);
      }
    } catch (error) {
      loading.textContent = error.message || 'Invitations could not be loaded.';
    }
  }

  document.addEventListener('click', event => {
    const remix = event.target.closest('[data-video-remix]');
    if (remix) {
      const postId = remix.dataset.videoRemix;
      const post = typeof window.findVisiblePost === 'function' ? window.findVisiblePost(postId) : null;
      if (!post || typeof window.openVideoComposer !== 'function') return notify('The remix composer is unavailable.');
      window.openVideoComposer({
        videoFormat: 'reel',
        remixOfPostId: post.id,
        remixSourceUsername: post.author?.username || 'creator'
      });
      return;
    }
    const settings = event.target.closest('[data-video-remix-settings]');
    if (settings) return void editRemixPermissions(settings.dataset.videoRemixSettings);
    const collaborator = event.target.closest('[data-video-collaborator-invite]');
    if (collaborator) return void inviteCollaborator(collaborator.dataset.videoCollaboratorInvite);
    if (event.target.closest('[data-video-collaboration-inbox]')) return void showInvitations();
  });
})();
