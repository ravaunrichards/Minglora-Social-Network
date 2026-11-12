/* Minglora's unified 10-style profile registry and 9 responsive screen-layout presets. */
(() => {
  const screenLayouts = [
    { id: 'full-screen', name: 'Full screen', description: 'Use the full available profile canvas.' },
    { id: 'fluid-panel', name: 'Fluid panel', description: 'Panels resize fluidly with the viewport.' },
    { id: 'fluid-grid', name: 'Fluid grid', description: 'Content tiles adapt continuously to available width.' },
    { id: 'fixed-grid', name: 'Fixed grid', description: 'Consistent tile proportions with responsive columns.' },
    { id: 'fixed-panel', name: 'Fixed panel', description: 'A readable panel width that remains centred.' },
    { id: 'side-by-side', name: 'Side by side', description: 'Identity and profile content share available columns.' },
    { id: 'spotlight', name: 'Spotlight', description: 'Prioritise the profile identity and primary content.' },
    { id: 'roundtable-1', name: 'Roundtable 1', description: 'A compact multi-column social layout.' },
    { id: 'roundtable-2', name: 'Roundtable 2', description: 'A wide multi-column community layout.' }
  ];
  const styles = [
    { id: 'facebook', name: 'Facebook-style Profile', description: 'Cover-led identity, profile details, connections, albums and a timeline.', defaultTab: 'posts', tabs: [['posts','Posts'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['more','More']] },
    { id: 'tiktok', name: 'TikTok-style Profile', description: 'Creator-first identity, follower metrics and a vertical short-video grid.', defaultTab: 'reels', tabs: [['reels','Videos'],['posts','Posts'],['photos','Photos'],['friends','Friends'],['about','About'],['more','More']] },
    { id: 'instagram', name: 'Instagram-style Profile', description: 'Avatar-led biography, story highlights, media grid and tagged photos.', defaultTab: 'posts', tabs: [['posts','Posts'],['reels','Reels'],['photos','Tagged'],['highlights','Highlights'],['about','About'],['more','More']] },
    { id: 'youtube', name: 'YouTube-style Profile', description: 'Channel banner, creator identity, video shelves, community and About.', defaultTab: 'posts', tabs: [['posts','Home'],['reels','Videos'],['photos','Photos'],['groups','Community'],['about','About'],['more','More']] },
    { id: 'x', name: 'X (Twitter)-style Profile', description: 'Compact public identity, concise post stream and media-focused navigation.', defaultTab: 'posts', tabs: [['posts','Posts'],['about','About'],['photos','Media'],['reels','Video'],['friends','Network'],['more','More']] },
    { id: 'linkedin', name: 'LinkedIn-style Profile', description: 'Professional introduction, work history, education, connections and activity.', defaultTab: 'about', tabs: [['about','About'],['posts','Activity'],['friends','Connections'],['groups','Groups'],['photos','Media'],['more','More']] },
    { id: 'pinterest', name: 'Pinterest-style Profile', description: 'Visual-first boards and albums built from the member’s real photos and posts.', defaultTab: 'photos', tabs: [['photos','Boards & Pins'],['posts','Created'],['reels','Video Pins'],['about','About'],['friends','Community'],['more','More']] },
    { id: 'twitch', name: 'Twitch-style Profile', description: 'Channel-focused identity, video library, clips, highlights and About.', defaultTab: 'reels', tabs: [['posts','Home'],['reels','Videos & Clips'],['highlights','Highlights'],['friends','Community'],['about','About'],['more','More']] },
    { id: 'snapchat', name: 'Snapchat-style Profile', description: 'Avatar-led profile with story highlights, Spotlight-style videos and memories.', defaultTab: 'highlights', tabs: [['highlights','Stories'],['reels','Spotlight'],['photos','Memories'],['friends','Friends'],['about','Profile'],['more','More']] },
    { id: 'minglora', name: 'Custom Minglora-style Profile', description: 'A native Minglora experience with the complete profile feature set.', defaultTab: 'posts', tabs: [['posts','Posts'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['more','More']] }
  ];
  const normalize = value => styles.some(style => style.id === value) ? value : 'facebook';
  const normalizeLayout = value => screenLayouts.some(layout => layout.id === value) ? value : 'fluid-panel';
  const get = value => styles.find(style => style.id === normalize(value));
  const supports = (style, layout) => styles.some(item => item.id === style) && screenLayouts.some(item => item.id === layout);
  const matrix = styles.flatMap(style => screenLayouts.map(layout => ({ style: style.id, layout: layout.id })));
  window.MingloraProfileStyleSystem = Object.freeze({
    styles: Object.freeze(styles.map(style => Object.freeze({ ...style, tabs: Object.freeze(style.tabs.map(tab => Object.freeze(tab.slice()))) }))),
    screenLayouts: Object.freeze(screenLayouts.map(layout => Object.freeze({ ...layout }))),
    matrix: Object.freeze(matrix.map(item => Object.freeze(item))),
    normalize, normalizeLayout, get, supports
  });
})();
