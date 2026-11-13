(() => {
  'use strict';

  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const formatBytes = value => {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  const formatDuration = value => {
    const seconds = Math.max(0, Math.round(Number(value || 0) / 1000));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };
  const dateLabel = value => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Not recorded';
  };
  const mimeByExtension = Object.freeze({
    mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',opus:'audio/ogg',
    wav:'audio/wav',flac:'audio/flac',aac:'audio/aac',webm:'audio/webm'
  });
  const extensionFor = filename => String(filename || '').split('.').pop().toLowerCase();
  const filenamePattern = /^[a-z0-9]+(?:_[a-z0-9]+){2,}_v[0-9]{3,}\.(mp3|m4a|ogg|opus|wav|flac|aac|webm)$/i;

  async function request(path, options = {}) {
    const response = await fetch('/api' + path, {
      credentials:'same-origin',
      headers:{'Content-Type':'application/json',Accept:'application/json',...(options.headers || {})},
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The audio request could not be completed.');
    return payload;
  }

  function encodeMetadata(values) {
    const encoder = new TextEncoder();
    return Object.entries(values).map(([key,value]) => {
      const bytes = encoder.encode(String(value));
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return key + ' ' + btoa(binary);
    }).join(',');
  }

  async function uploadTus(file, upload) {
    if (!upload?.endpoint || !upload?.token || !upload?.bucket || !upload?.path) {
      throw new Error('Minglora did not return a valid signed upload.');
    }
    const created = await fetch(upload.endpoint, {
      method:'POST',
      headers:{
        'Tus-Resumable':'1.0.0',
        'Upload-Length':String(file.size),
        'Upload-Metadata':encodeMetadata({
          bucketName:upload.bucket,
          objectName:upload.path,
          contentType:file.type,
          cacheControl:'3600'
        }),
        'x-signature':upload.token
      }
    });
    if (created.status !== 201) throw new Error('The secure upload could not be started (' + created.status + ').');
    const location = created.headers.get('location');
    if (!location) throw new Error('The upload provider did not return its resumable upload location.');
    const uploadUrl = new URL(location, upload.endpoint).toString();
    const chunkSize = 6 * 1024 * 1024;
    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
      const patched = await fetch(uploadUrl, {
        method:'PATCH',
        headers:{
          'Tus-Resumable':'1.0.0',
          'Upload-Offset':String(offset),
          'Content-Type':'application/offset+octet-stream',
          'x-signature':upload.token
        },
        body:chunk
      });
      if (patched.status !== 204) throw new Error('The audio upload stopped at ' + formatBytes(offset) + ' (' + patched.status + ').');
      const nextOffset = Number(patched.headers.get('upload-offset'));
      if (!Number.isSafeInteger(nextOffset) || nextOffset !== offset + chunk.size) {
        throw new Error('The storage provider returned an unexpected upload offset.');
      }
      offset = nextOffset;
    }
  }

  async function inspectFile(file) {
    if (!window.crypto?.subtle) throw new Error('This browser cannot calculate a SHA-256 checksum for the selected file.');
    const bytes = await file.arrayBuffer();
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
    const objectUrl = URL.createObjectURL(file);
    try {
      const metadata = await new Promise((resolve,reject) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          const duration = Number(audio.duration);
          if (!Number.isFinite(duration) || duration <= 0) return reject(new Error('The audio duration could not be verified.'));
          resolve({durationMs:Math.round(duration * 1000)});
        };
        audio.onerror = () => reject(new Error('The selected file could not be decoded as an audio recording.'));
        audio.src = objectUrl;
        audio.load();
      });
      const durationMs = metadata.durationMs;
      return {
        sha256,durationMs,
        sampleRateHz:null,
        channelCount:null,
        bitRateBps:Math.round(file.size * 8 * 1000 / durationMs)
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function initialize(root) {
    const section = root?.querySelector('#admin-audio-management');
    if (!section || section.dataset.initialized === 'true') return;
    section.dataset.initialized = 'true';

    const status = section.querySelector('#admin-audio-status');
    const metrics = section.querySelector('#admin-audio-metrics');
    const assetList = section.querySelector('#admin-audio-assets');
    const assignmentList = section.querySelector('#admin-audio-assignments');
    const categorySelect = section.querySelector('#admin-audio-category');
    const eventSelect = section.querySelector('#admin-audio-event');
    const uploadForm = section.querySelector('#admin-audio-upload-form');
    const fileInput = section.querySelector('#admin-audio-file');
    const submit = section.querySelector('#admin-audio-upload-submit');
    const refresh = section.querySelector('#admin-audio-refresh');
    const filter = section.querySelector('#admin-audio-filter');
    const assignForm = section.querySelector('#admin-audio-assign-form');
    const assignEvent = section.querySelector('#admin-audio-assign-event');
    const assignAsset = section.querySelector('#admin-audio-assign-asset');
    const assignVolume = section.querySelector('#admin-audio-assign-volume');
    const assignVolumeLabel = section.querySelector('#admin-audio-assign-volume-label');
    let catalog = {categories:[],events:[],assets:[],assignments:[],summary:{}};
    let busy = false;

    const setStatus = (message, error = false) => {
      if (!status) return;
      status.textContent = message;
      status.dataset.state = error ? 'error' : 'normal';
    };
    const eventCategoryKey = event => {
      const relation = event.minglora_audio_categories || event.category || {};
      return relation.category_key || event.category_key || '';
    };
    const fillEventOptions = () => {
      const selectedCategory = String(categorySelect?.value || '');
      const events = catalog.events.filter(event => event.is_active && (!selectedCategory || eventCategoryKey(event) === selectedCategory));
      if (eventSelect) {
        eventSelect.innerHTML = '<option value="">No single event assignment</option>' + events.map(event =>
          '<option value="' + escapeText(event.event_key) + '">' + escapeText(event.label) + '</option>'
        ).join('');
      }
      if (assignEvent) {
        const previous = assignEvent.value;
        assignEvent.innerHTML = '<option value="">Choose platform event</option>' + catalog.events.filter(event => event.is_active).map(event =>
          '<option value="' + escapeText(event.event_key) + '">' + escapeText(event.label) + ' · ' + escapeText(eventCategoryKey(event).replace(/_/g,' ')) + '</option>'
        ).join('');
        if (catalog.events.some(event => event.event_key === previous && event.is_active)) assignEvent.value = previous;
      }
    };
    const fillCategories = () => {
      const options = catalog.categories.filter(category => category.is_active).map(category =>
        '<option value="' + escapeText(category.category_key) + '">' + escapeText(category.label) + '</option>'
      ).join('');
      if (categorySelect) categorySelect.innerHTML = options || '<option value="">No active categories</option>';
      fillEventOptions();
    };
    const approvedAssets = () => catalog.assets.filter(asset =>
      asset.scope === 'platform' && asset.review_status === 'approved' &&
      asset.authenticity_status === 'verified_authentic' && asset.license_verified === true &&
      asset.commercial_use_allowed === true && asset.redistribution_allowed === true &&
      (!asset.attribution_required || String(asset.attribution_text || '').trim())
    );
    const fillAssignableAssets = () => {
      const list = approvedAssets();
      if (assignAsset) assignAsset.innerHTML = '<option value="">Choose approved recording</option>' + list.map(asset =>
        '<option value="' + escapeText(asset.id) + '">' + escapeText(asset.title) + '</option>'
      ).join('');
    };
    const renderMetrics = () => {
      const summary = catalog.summary || {};
      const values = [
        ['Registered sounds',summary.totalAssets || 0],
        ['Pending review',summary.pendingReview || 0],
        ['Approved',summary.approvedAssets || 0],
        ['Active assignments',summary.activeAssignments || 0],
        ['Stored catalogue data',formatBytes(summary.storageBytes || 0)]
      ];
      if (metrics) metrics.innerHTML = values.map(([label,value]) =>
        '<article class="admin-audio-metric"><strong>' + escapeText(Number(value) ? Number(value).toLocaleString() : value) + '</strong><small>' + escapeText(label) + '</small></article>'
      ).join('');
    };
    const renderAssets = () => {
      if (!assetList) return;
      const query = String(filter?.value || '').trim().toLowerCase();
      const items = catalog.assets.filter(asset => !query || [
        asset.title,asset.description,asset.original_filename,asset.asset_key,
        asset.minglora_audio_categories?.label,asset.minglora_audio_licenses?.license_name,
        asset.minglora_audio_sources?.website_name
      ].some(value => String(value || '').toLowerCase().includes(query)));
      if (!items.length) {
        assetList.innerHTML = '<p class="admin-audio-empty">' + (query ? 'No recordings match this search.' : 'No recordings have been registered. Upload an authentic recording and submit its source and licensing details for review.') + '</p>';
        return;
      }
      assetList.innerHTML = items.map(asset => {
        const category = asset.minglora_audio_categories?.label || 'Uncategorised';
        const source = asset.minglora_audio_sources?.website_name || 'Source not recorded';
        const license = asset.minglora_audio_licenses?.license_name || 'Licence not recorded';
        const pending = ['draft','pending_review'].includes(asset.review_status);
        return '<article class="admin-audio-asset-card" data-audio-asset="' + escapeText(asset.id) + '">' +
          '<div class="admin-audio-asset-heading"><div><strong>' + escapeText(asset.title) + '</strong><small>' + escapeText(category) + ' · ' + escapeText(asset.original_filename) + '</small></div>' +
          '<span class="admin-audio-status-pill" data-status="' + escapeText(asset.review_status) + '">' + escapeText(asset.review_status.replace(/_/g,' ')) + '</span></div>' +
          '<p>' + escapeText(asset.description || 'No description supplied.') + '</p>' +
          '<div class="admin-audio-asset-meta"><span>Source: ' + escapeText(source) + '</span><span>Licence: ' + escapeText(license) + '</span>' +
          '<span>Duration: ' + escapeText(formatDuration(asset.duration_ms)) + '</span><span>File: ' + escapeText(formatBytes(asset.file_size_bytes)) + '</span>' +
          '<span>Authenticity: ' + escapeText(asset.authenticity_status.replace(/_/g,' ')) + '</span><span>Commercial: ' + (asset.commercial_use_allowed ? 'Yes' : 'Not confirmed') + '</span>' +
          '<span>Redistribution: ' + (asset.redistribution_allowed ? 'Yes' : 'Not confirmed') + '</span><span>Checksum: ' + escapeText(String(asset.sha256 || '').slice(0,16)) + '…</span></div>' +
          '<div class="admin-audio-asset-actions"><button type="button" class="secondary" data-audio-preview="' + escapeText(asset.id) + '">Preview</button>' +
          (pending ? '<button type="button" class="secondary" data-audio-approve="' + escapeText(asset.id) + '">Approve after review</button>' +
          '<select aria-label="Rejection reason" data-audio-rejection="' + escapeText(asset.id) + '"><option value="other">Other / insufficient evidence</option><option value="synthetic">Synthetic sound</option><option value="ai">AI-generated audio</option><option value="misrepresented">Misrepresented recording</option></select>' +
          '<button type="button" class="danger" data-audio-reject="' + escapeText(asset.id) + '">Reject</button>' : '') +
          '</div><p class="admin-audio-card-status" role="status" aria-live="polite"></p></article>';
      }).join('');
    };
    const renderAssignments = () => {
      if (!assignmentList) return;
      const events = catalog.events.filter(event => event.is_active);
      if (!events.length) {
        assignmentList.innerHTML = '<p class="admin-audio-empty">No active sound events are registered.</p>';
        return;
      }
      assignmentList.innerHTML = events.map(event => {
        const assignment = catalog.assignments.find(item => item.event_key === event.event_key);
        const sound = assignment?.minglora_audio_assets?.title ||
          catalog.assets.find(asset => asset.id === assignment?.asset_id)?.title || 'No sound assigned';
        return '<div class="admin-audio-assignment-row"><div><strong>' + escapeText(event.label) + '</strong><small>' +
          escapeText(event.event_key) + '</small></div><span>' + escapeText(sound) + '</span><span class="admin-audio-status-pill" data-status="' +
          (assignment?.is_enabled ? 'active' : 'inactive') + '">' + (assignment ? (assignment.is_enabled ? 'Enabled' : 'Disabled') : 'Unassigned') + '</span></div>';
      }).join('');
    };
    const render = () => {
      renderMetrics();
      renderAssets();
      renderAssignments();
      fillCategories();
      fillAssignableAssets();
    };
    const load = async () => {
      if (busy) return;
      busy = true;
      if (refresh) refresh.disabled = true;
      setStatus('Loading the protected audio catalogue…');
      try {
        catalog = await request('/admin/audio/catalog');
        catalog.categories = Array.isArray(catalog.categories) ? catalog.categories : [];
        catalog.events = Array.isArray(catalog.events) ? catalog.events : [];
        catalog.assets = Array.isArray(catalog.assets) ? catalog.assets : [];
        catalog.assignments = Array.isArray(catalog.assignments) ? catalog.assignments : [];
        render();
        setStatus(catalog.assets.length + ' registered recording(s) loaded. Unverified recordings remain unavailable for platform playback.');
      } catch (error) {
        setStatus(error.message || 'The audio catalogue could not be loaded. Apply the reviewed schema migration before using this workspace.',true);
        if (assetList) assetList.innerHTML = '<p class="admin-audio-empty">' + escapeText(error.message || 'The catalogue is unavailable.') + '</p>';
      } finally {
        busy = false;
        if (refresh) refresh.disabled = false;
      }
    };

    categorySelect?.addEventListener('change',fillEventOptions);
    filter?.addEventListener('input',renderAssets);
    refresh?.addEventListener('click',load);
    assignVolume?.addEventListener('input',() => {
      if (assignVolumeLabel) assignVolumeLabel.textContent = Math.round(Number(assignVolume.value) * 100) + '%';
    });

    uploadForm?.addEventListener('submit',async event => {
      event.preventDefault();
      if (busy) return;
      const file = fileInput?.files?.[0];
      if (!file) return setStatus('Choose an audio file first.',true);
      if (file.size < 1 || file.size > 50 * 1024 * 1024) return setStatus('Audio uploads must be 50 MB or smaller.',true);
      if (!file.type || !Object.values(mimeByExtension).includes(file.type)) return setStatus('Choose a supported audio format: MP3, M4A, OGG, WAV, FLAC, AAC or WebM.',true);
      if (!filenamePattern.test(file.name)) return setStatus('Rename the file using category_event_description_v001.ext before uploading.',true);
      const categoryKey = String(categorySelect?.value || '');
      const eventKey = String(eventSelect?.value || '');
      const ext = extensionFor(file.name);
      if (!categoryKey) return setStatus('Choose an active audio category.',true);
      if (!String(uploadForm.elements.originType?.value || '')) return setStatus('Choose the type of authentic recording.',true);
      if (!String(uploadForm.elements.sourceWebsite?.value || '').trim()) return setStatus('Enter the original source website.',true);
      if (!String(uploadForm.elements.originalDownloadPage?.value || '').trim()) return setStatus('Enter the original download page.',true);
      if (!String(uploadForm.elements.licenseName?.value || '').trim()) return setStatus('Enter the exact licence name.',true);
      if (!String(uploadForm.elements.licenseUrl?.value || '').trim()) return setStatus('Enter the licence URL.',true);
      if (!String(uploadForm.elements.downloadDate?.value || '').trim()) return setStatus('Enter the download date.',true);
      if (!uploadForm.elements.rightsConfirmed?.checked) return setStatus('Confirm that the recording is authentic and its source rights were checked.',true);
      busy = true;
      submit.disabled = true;
      setStatus('Inspecting the recording and calculating its SHA-256 checksum…');
      try {
        const inspected = await inspectFile(file);
        setStatus('Preparing a private, resumable Supabase upload…');
        const prepared = await request('/media/upload/prepare',{
          method:'POST',
          body:JSON.stringify({slot:'sound',mimeType:file.type,byteSize:file.size,fileName:file.name})
        });
        const upload = prepared.upload || {};
        await uploadTus(file,upload);
        setStatus('Upload complete. Verifying the stored media object…');
        const completed = await request('/media/upload/complete',{
          method:'POST',body:JSON.stringify({assetId:prepared.assetId})
        });
        if (!completed.asset?.id) throw new Error('Minglora did not confirm the uploaded audio asset.');
        setStatus('Registering the file, source, licence, technical metadata and checksum…');
        const metadata = {
          title:String(uploadForm.elements.title.value || '').trim(),
          description:String(uploadForm.elements.description.value || '').trim(),
          scope:'platform',categoryKey,eventKey:eventKey || null,
          originalFilename:file.name,fileFormat:ext,
          originType:String(uploadForm.elements.originType.value),
          authenticityStatus:'unverified',reviewStatus:'pending_review',
          sourceWebsite:String(uploadForm.elements.sourceWebsite.value || '').trim(),
          originalDownloadPage:String(uploadForm.elements.originalDownloadPage.value || '').trim(),
          licenseName:String(uploadForm.elements.licenseName.value || '').trim(),
          licenseUrl:String(uploadForm.elements.licenseUrl.value || '').trim(),
          attributionText:String(uploadForm.elements.attributionText.value || '').trim(),
          downloadDate:String(uploadForm.elements.downloadDate.value || ''),
          byteSize:file.size,durationMs:inspected.durationMs,
          sampleRateHz:inspected.sampleRateHz,bitRateBps:inspected.bitRateBps,
          channelCount:inspected.channelCount,sha256:inspected.sha256,
          commercialUseAllowed:uploadForm.elements.commercialUseAllowed.checked,
          redistributionAllowed:uploadForm.elements.redistributionAllowed.checked,
          attributionRequired:uploadForm.elements.attributionRequired.checked,
          licenseVerified:false,rightsConfirmed:true
        };
        const registered = await request('/admin/audio/assets',{
          method:'POST',body:JSON.stringify({mediaAssetId:completed.asset.id,metadata})
        });
        uploadForm.reset();
        await load();
        setStatus('Recording uploaded and registered for review. It is not assigned or playable on the platform until authenticity and licence approval.',false);
      } catch (error) {
        setStatus(error.message || 'The recording could not be uploaded or registered.',true);
      } finally {
        busy = false;
        submit.disabled = false;
      }
    });

    assetList?.addEventListener('click',async event => {
      const preview = event.target.closest('[data-audio-preview]');
      const approve = event.target.closest('[data-audio-approve]');
      const reject = event.target.closest('[data-audio-reject]');
      if (preview) {
        const id = preview.dataset.audioPreview;
        const card = preview.closest('.admin-audio-asset-card');
        const message = card?.querySelector('.admin-audio-card-status');
        preview.disabled = true;
        try {
          const result = await request('/admin/audio/assets/' + encodeURIComponent(id) + '/preview');
          if (!result.url) throw new Error('A temporary preview URL was not returned.');
          const audio = new Audio(result.url);
          audio.preload = 'none';
          await audio.play();
          if (message) message.textContent = 'Preview is playing. It uses a temporary private URL.';
          audio.addEventListener('ended',() => { if (message) message.textContent = 'Preview ended.'; },{once:true});
        } catch (error) {
          if (message) message.textContent = error.message || 'The recording preview could not be played.';
        } finally { preview.disabled = false; }
      }
      if (approve) {
        const id = approve.dataset.audioApprove;
        const confirmed = window.confirm('Confirm that you listened to the complete recording, verified it is an authentic real recording, checked the exact licence, and confirmed both commercial use and redistribution are permitted?');
        if (!confirmed) return;
        approve.disabled = true;
        const card = approve.closest('.admin-audio-asset-card');
        const message = card?.querySelector('.admin-audio-card-status');
        try {
          await request('/admin/audio/assets/' + encodeURIComponent(id) + '/review',{
            method:'POST',body:JSON.stringify({decision:'approve',confirmAuthenticity:true,confirmLicenseReview:true})
          });
          if (message) message.textContent = 'Recording approved after review.';
          await load();
        } catch (error) {
          if (message) message.textContent = error.message || 'Approval failed.';
        } finally { approve.disabled = false; }
      }
      if (reject) {
        const id = reject.dataset.audioReject;
        const reason = assetList.querySelector('[data-audio-rejection="' + CSS.escape(id) + '"]')?.value || 'other';
        if (!window.confirm('Reject this recording and keep it out of all platform assignments?')) return;
        reject.disabled = true;
        const card = reject.closest('.admin-audio-asset-card');
        const message = card?.querySelector('.admin-audio-card-status');
        try {
          await request('/admin/audio/assets/' + encodeURIComponent(id) + '/review',{
            method:'POST',body:JSON.stringify({decision:'reject',rejectionType:reason})
          });
          if (message) message.textContent = 'Recording rejected and excluded from platform playback.';
          await load();
        } catch (error) {
          if (message) message.textContent = error.message || 'Rejection failed.';
        } finally { reject.disabled = false; }
      }
    });

    assignForm?.addEventListener('submit',async event => {
      event.preventDefault();
      if (busy) return;
      const eventKey = String(assignEvent?.value || '');
      const assetId = String(assignAsset?.value || '');
      if (!eventKey || !assetId) return setStatus('Choose an active event and an approved recording.',true);
      busy = true;
      const button = assignForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await request('/admin/audio/assignments',{
          method:'POST',
          body:JSON.stringify({
            eventKey,assetId,volume:Number(assignVolume?.value || 1),
            enabled:true,loopPlayback:Boolean(assignForm.elements.loopPlayback?.checked)
          })
        });
        await load();
        setStatus('Platform sound assignment saved. Existing member mute and volume preferences remain in control.',false);
      } catch (error) {
        setStatus(error.message || 'The sound assignment could not be saved.',true);
      } finally {
        busy = false;
        if (button) button.disabled = false;
      }
    });

    load();
  }

  window.MingloraAudioAdmin = Object.freeze({initialize});
  const root = document.querySelector('#admin-centre-root');
  if (root) {
    initialize(root);
    const observer = new MutationObserver(() => {
      if (root.querySelector('#admin-audio-management')) {
        initialize(root);
        observer.disconnect();
      }
    });
    observer.observe(root,{childList:true,subtree:true});
  }
})();