(() => {
"use strict";
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[char]));
let directory = null;
function flatten() {
  return (directory?.groups || []).flatMap(group =>
    (group.sources || []).map(source => ({...source, groupKey:group.key, groupLabel:group.label}))
  );
}
function render() {
  const query = $("#search").value.trim().toLowerCase();
  const category = $("#category").value;
  const sources = flatten().filter(source =>
    (!category || source.groupKey === category) &&
    (!query || [source.name,source.url,source.groupLabel,source.id].join(" ").toLowerCase().includes(query))
  );
  const selectedGroups = (directory.groups || []).filter(group => !category || group.key === category);
  $("#summary").textContent = "Showing " + sources.length + " of " + directory.sourceCount +
    " candidate listings · 0 approved recordings in the initial asset registry.";
  $("#groups").innerHTML = selectedGroups.map(group => {
    const records = sources.filter(source => source.groupKey === group.key);
    if (!records.length) return "";
    return '<section class="group"><h2>' + esc(group.label) + '</h2><div class="sources">' +
      records.map(source => '<article class="source"><strong>' + esc(source.name) + '</strong>' +
        '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.url) + '</a>' +
        '<small>' + esc(source.id) + ' · candidate source only · review each downloaded file</small></article>').join("") +
      '</div></section>';
  }).join("") || '<section class="group"><p>No sources match this search.</p></section>';
}
async function start() {
  try {
    const response = await fetch("/assets/audio-resource-directory.json", {cache:"no-cache"});
    if (!response.ok) throw new Error("Could not load the source directory.");
    directory = await response.json();
    if (directory.schemaVersion !== 1 || !Array.isArray(directory.groups)) throw new Error("The source directory format is invalid.");
    $("#category").innerHTML += directory.groups.map(group =>
      '<option value="' + esc(group.key) + '">' + esc(group.label) + '</option>'
    ).join("");
    $("#types").innerHTML = directory.requiredAudioTypes.map(item =>
      '<span class="type">' + esc(item.label) + '</span>'
    ).join("");
    $("#search").addEventListener("input", render);
    $("#category").addEventListener("change", render);
    render();
  } catch (error) {
    $("#summary").textContent = error.message;
    $("#groups").innerHTML = '<section class="group"><p>Audio source directory unavailable. Reload this page to try again.</p></section>';
  }
}
start();
})();