import * as maplibregl from "./vendor/maplibre-gl.mjs";

(() => {
  "use strict";

  const I18N = {
    zh: {
      random: "随机旅行",
      eyebrow: "A LIFE IN MOTION · 一生在路上",
      heroTitle: "把世界<br />走成一本相册",
      heroSubtitle: "拖动地图，点击发光的地点，重新走进那些抵达过的时刻。",
      photos: "张照片",
      places: "个地点",
      countries: "个国家",
      mapHint: "拖动世界 · 点击光点",
      demoBadge: "示例模式 · 放入照片后自动替换",
      archive: "JOURNEY ARCHIVE · 旅行档案",
      discover: "发现一段旅程",
      search: "搜索国家、城市或旅程",
      album: "旅程",
      allAlbums: "全部旅程",
      sortPopular: "按照片数量",
      sortName: "按地点名称",
      photoUnit: "张照片",
      demoPlace: "示例地点",
      loading: "正在打开这段旅程…",
      loadMore: "继续浏览",
      emptyTitle: "这里正等待你的照片",
      emptyBody: "把按地点命名的照片放进 photos 文件夹，地图会自动更新。",
      noResults: "没有找到这个地点。换一个关键词，或者去地图上看看吧。",
      mapUnavailable: "地图暂时没有加载，但你仍然可以从右侧浏览地点。",
      openPlace: "打开地点",
      unresolved: "这个地点没有坐标，因此暂时不会显示在地图上。"
    },
    en: {
      random: "Surprise me",
      eyebrow: "A LIFE IN MOTION · 一生在路上",
      heroTitle: "A life mapped<br />in photographs",
      heroSubtitle: "Move across the world, follow a point of light, and return to a moment once lived.",
      photos: "photos",
      places: "places",
      countries: "countries",
      mapHint: "DRAG THE WORLD · FOLLOW THE LIGHT",
      demoBadge: "DEMO MODE · YOUR PHOTOS WILL REPLACE THIS",
      archive: "JOURNEY ARCHIVE · 旅行档案",
      discover: "Find a journey",
      search: "Search a city, country or journey",
      album: "Journey",
      allAlbums: "All journeys",
      sortPopular: "Most photographs",
      sortName: "Place name",
      photoUnit: "photographs",
      demoPlace: "Demo location",
      loading: "Opening this journey…",
      loadMore: "Keep exploring",
      emptyTitle: "This place is waiting for your photographs",
      emptyBody: "Add location-named images to the photos folder and the map will update itself.",
      noResults: "No place matches that search. Try another word or explore the map.",
      mapUnavailable: "The map could not load, but every place is still available in the archive.",
      openPlace: "Open place",
      unresolved: "This place has no coordinates yet, so it is not shown on the map."
    }
  };

  const state = {
    data: null,
    lang: localStorage.getItem("atlas-language") || (navigator.language?.startsWith("zh") ? "zh" : "en"),
    map: null,
    mapReady: false,
    places: [],
    search: "",
    album: "all",
    sort: "count",
    selectedPlace: null,
    currentPhotos: [],
    visiblePhotos: 0,
    lightboxIndex: 0,
    drawerRequest: 0
  };

  const el = {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function t(key) {
    return I18N[state.lang][key] || key;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(state.lang === "zh" ? "zh-CN" : "en-IE").format(value || 0);
  }

  function placeName(place) {
    return state.lang === "zh" ? (place.nameZh || place.nameEn || place.query) : (place.nameEn || place.nameZh || place.query);
  }

  function countryName(place) {
    return state.lang === "zh" ? (place.countryZh || place.countryEn || "") : (place.countryEn || place.countryZh || "");
  }

  function seedColors(seed = "world") {
    let hash = 0;
    for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    const palettes = [
      ["#173f37", "#8b6545"], ["#233a4d", "#8b6c58"], ["#3b2d45", "#9a6b55"],
      ["#193d42", "#667b55"], ["#4b342b", "#9a854f"], ["#183b35", "#6b526e"]
    ];
    return palettes[Math.abs(hash) % palettes.length];
  }

  function cacheElements() {
    [
      "app", "home-button", "brand-title", "footer-owner", "random-button", "language-button", "hero-copy",
      "hero-title", "hero-subtitle", "map-stats", "stat-photos", "stat-places", "stat-countries", "map-hint",
      "demo-badge", "explorer", "search-input", "album-select", "sort-button", "place-list", "mobile-map-button",
      "place-drawer", "drawer-close", "drawer-hero", "drawer-country", "drawer-title", "drawer-count", "drawer-loading",
      "photo-grid", "load-more", "empty-place", "lightbox", "lightbox-close", "lightbox-prev", "lightbox-next",
      "lightbox-image", "lightbox-caption", "toast"
    ].forEach((id) => { el[id] = document.getElementById(id); });
  }

  async function init() {
    cacheElements();
    bindEvents();
    setLanguage(state.lang);

    try {
      const response = await fetch("./data/index.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
      state.data = await response.json();
      state.places = state.data.places || [];
      applyProjectCopy();
      renderAlbumOptions();
      renderStats();
      renderPlaces();
      el["demo-badge"].classList.toggle("hidden", !state.data.meta?.demo);
      initMap();
    } catch (error) {
      console.error(error);
      el["place-list"].innerHTML = `<div class="no-results">${escapeHtml(t("mapUnavailable"))}</div>`;
    }
  }

  function bindEvents() {
    el["language-button"].addEventListener("click", () => setLanguage(state.lang === "zh" ? "en" : "zh"));
    el["random-button"].addEventListener("click", selectRandomPlace);
    el["home-button"].addEventListener("click", resetWorld);
    el["search-input"].addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLocaleLowerCase();
      renderPlaces();
      updateMapData();
    });
    el["album-select"].addEventListener("change", (event) => {
      state.album = event.target.value;
      renderPlaces();
      updateMapData();
      fitFilteredPlaces();
    });
    el["sort-button"].addEventListener("click", () => {
      state.sort = state.sort === "count" ? "name" : "count";
      renderPlaces();
      el["sort-button"].querySelector("span").textContent = t(state.sort === "count" ? "sortPopular" : "sortName");
    });
    el["drawer-close"].addEventListener("click", closeDrawer);
    el["load-more"].addEventListener("click", () => {
      state.visiblePhotos += 36;
      renderPhotoGrid();
    });
    el["mobile-map-button"].addEventListener("click", () => el.app.classList.toggle("map-expanded"));
    el["lightbox-close"].addEventListener("click", closeLightbox);
    el["lightbox-prev"].addEventListener("click", () => stepLightbox(-1));
    el["lightbox-next"].addEventListener("click", () => stepLightbox(1));
    el.lightbox.addEventListener("click", (event) => { if (event.target === el.lightbox) closeLightbox(); });
    document.addEventListener("keydown", (event) => {
      if (!el.lightbox.classList.contains("open")) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") stepLightbox(-1);
      if (event.key === "ArrowRight") stepLightbox(1);
    });
  }

  function setLanguage(lang) {
    state.lang = lang;
    localStorage.setItem("atlas-language", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
    el["language-button"].innerHTML = lang === "zh"
      ? '<span class="language-current">中</span><span class="language-divider">/</span><span>EN</span>'
      : '<span>中</span><span class="language-divider">/</span><span class="language-current">EN</span>';
    el["hero-title"].innerHTML = t("heroTitle");
    el["hero-subtitle"].textContent = t("heroSubtitle");
    el["search-input"].placeholder = t("search");
    el["sort-button"].querySelector("span").textContent = t(state.sort === "count" ? "sortPopular" : "sortName");
    if (state.data) {
      applyProjectCopy();
      renderAlbumOptions();
      renderStats();
      renderPlaces();
      if (state.selectedPlace) updateDrawerHeader(state.selectedPlace);
    }
  }

  function applyProjectCopy() {
    const settings = state.data.settings || {};
    const title = state.lang === "zh" ? settings.titleZh : settings.titleEn;
    const owner = state.lang === "zh" ? settings.ownerZh : settings.ownerEn;
    const subtitle = state.lang === "zh" ? settings.subtitleZh : settings.subtitleEn;
    el["brand-title"].textContent = title || (state.lang === "zh" ? "山的世界旅行地图" : "Shan's Travel Atlas");
    el["footer-owner"].textContent = owner || "Shan";
    el["hero-subtitle"].textContent = subtitle || t("heroSubtitle");
    document.title = title || "Shan's Travel Atlas";
  }

  function renderStats() {
    const places = state.data?.places || [];
    const countries = new Set(places.map((place) => place.countryCode).filter(Boolean));
    el["stat-photos"].textContent = formatNumber(state.data?.meta?.totalPhotos || 0);
    el["stat-places"].textContent = formatNumber(places.length);
    el["stat-countries"].textContent = formatNumber(countries.size);
  }

  function renderAlbumOptions() {
    const albums = state.data?.albums || [];
    const current = state.album;
    el["album-select"].innerHTML = [
      `<option value="all">${escapeHtml(t("allAlbums"))}</option>`,
      ...albums.map((album) => `<option value="${escapeHtml(album.id)}">${escapeHtml(album.name)}</option>`)
    ].join("");
    el["album-select"].value = albums.some((album) => album.id === current) ? current : "all";
  }

  function getFilteredPlaces() {
    const filtered = state.places.filter((place) => {
      const albumMatch = state.album === "all" || (place.albums || []).includes(state.album);
      const haystack = [place.query, place.nameZh, place.nameEn, place.countryZh, place.countryEn, ...(place.albumNames || [])]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      return albumMatch && (!state.search || haystack.includes(state.search));
    });
    return filtered.sort((a, b) => state.sort === "count"
      ? (b.count - a.count) || placeName(a).localeCompare(placeName(b))
      : placeName(a).localeCompare(placeName(b), state.lang === "zh" ? "zh-CN" : "en"));
  }

  function renderPlaces() {
    const places = getFilteredPlaces();
    if (!places.length) {
      el["place-list"].innerHTML = `<div class="no-results">${escapeHtml(t("noResults"))}</div>`;
      return;
    }

    el["place-list"].innerHTML = places.map((place, index) => {
      const [a, b] = seedColors(place.id);
      const cover = place.cover ? `background-image:url('${encodeURI(place.cover)}')` : "";
      const meta = place.count > 0 ? `${formatNumber(place.count)} ${t("photoUnit")}` : t("demoPlace");
      const active = state.selectedPlace?.id === place.id ? " active" : "";
      return `
        <button class="place-card${active}" data-place-id="${escapeHtml(place.id)}" aria-label="${escapeHtml(t("openPlace"))}: ${escapeHtml(placeName(place))}">
          <span class="place-card-cover" style="--seed-a:${a};--seed-b:${b};${cover}">
            <span class="place-card-index">${String(index + 1).padStart(2, "0")}</span>
          </span>
          <span class="place-card-copy">
            <p>${escapeHtml(countryName(place) || place.query)}</p>
            <strong>${escapeHtml(placeName(place))}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
          <span class="place-card-arrow" aria-hidden="true">›</span>
        </button>`;
    }).join("");

    el["place-list"].querySelectorAll(".place-card").forEach((card) => {
      card.addEventListener("click", () => {
        const place = state.places.find((item) => item.id === card.dataset.placeId);
        if (place) selectPlace(place);
      });
    });
  }

  function initMap() {
    try {
      state.map = new maplibregl.Map({
        container: "map",
        style: mapStyle(),
        center: [12, 22],
        zoom: 1.15,
        minZoom: 0.8,
        maxZoom: 15,
        attributionControl: true,
        dragRotate: false,
        pitchWithRotate: false
      });
      state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      state.map.on("load", () => {
        state.mapReady = true;
        try { state.map.setProjection({ type: "globe" }); } catch (_) { /* flat-map fallback */ }

        state.map.addSource("places", {
          type: "geojson",
          data: placesGeoJson(getFilteredPlaces()),
          cluster: true,
          clusterMaxZoom: 7,
          clusterRadius: 54
        });
        state.map.addSource("journey-route", { type: "geojson", data: routeGeoJson([]) });

        state.map.addLayer({
          id: "route-glow",
          type: "line",
          source: "journey-route",
          paint: { "line-color": "#e9b96e", "line-width": 6, "line-opacity": 0.11, "line-blur": 5 }
        });
        state.map.addLayer({
          id: "route-line",
          type: "line",
          source: "journey-route",
          paint: { "line-color": "#f5d89f", "line-width": 1.4, "line-opacity": 0.62, "line-dasharray": [1.5, 2.2] }
        });
        state.map.addLayer({
          id: "clusters-glow",
          type: "circle",
          source: "places",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#e9b96e", "circle-opacity": 0.12,
            "circle-radius": ["step", ["get", "point_count"], 24, 10, 31, 40, 40],
            "circle-blur": 0.65
          }
        });
        state.map.addLayer({
          id: "clusters",
          type: "circle",
          source: "places",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "rgba(20,42,35,.92)", "circle-stroke-color": "#e9b96e", "circle-stroke-width": 1.4,
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 21, 40, 27]
          }
        });
        state.map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "places",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
          paint: { "text-color": "#f8e2b6" }
        });
        state.map.addLayer({
          id: "point-glow",
          type: "circle",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          paint: { "circle-radius": 15, "circle-color": "#e9b96e", "circle-opacity": 0.13, "circle-blur": 0.6 }
        });
        state.map.addLayer({
          id: "points",
          type: "circle",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 4.5, 7, 8],
            "circle-color": "#f9e3ba", "circle-stroke-color": "rgba(6,17,14,.85)", "circle-stroke-width": 2
          }
        });

        state.map.on("click", "clusters", async (event) => {
          const feature = state.map.queryRenderedFeatures(event.point, { layers: ["clusters"] })[0];
          if (!feature) return;
          const zoom = await state.map.getSource("places").getClusterExpansionZoom(feature.properties.cluster_id);
          state.map.easeTo({ center: feature.geometry.coordinates, zoom, duration: reducedMotion ? 0 : 900 });
        });
        state.map.on("click", "points", (event) => {
          const id = event.features?.[0]?.properties?.placeId;
          const place = state.places.find((item) => item.id === id);
          if (place) selectPlace(place);
        });
        ["clusters", "points"].forEach((layer) => {
          state.map.on("mouseenter", layer, () => { state.map.getCanvas().style.cursor = "pointer"; });
          state.map.on("mouseleave", layer, () => { state.map.getCanvas().style.cursor = ""; });
        });
        fitFilteredPlaces();
      });
    } catch (error) {
      console.error(error);
      showToast(t("mapUnavailable"));
    }
  }

  function mapStyle() {
    const configured = state.data?.settings?.mapStyle;
    if (configured && configured !== "local") return configured;
    return {
      version: 8,
      projection: { type: "globe" },
      sources: {
        world: { type: "geojson", data: "./data/world.geo.json" }
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#081411" } },
        {
          id: "countries",
          type: "fill",
          source: "world",
          paint: {
            "fill-color": "#1a3b33",
            "fill-opacity": 0.9
          }
        },
        {
          id: "country-lines",
          type: "line",
          source: "world",
          paint: { "line-color": "rgba(180,206,193,.23)", "line-width": 0.55 }
        }
      ]
    };
  }

  function placesGeoJson(places) {
    return {
      type: "FeatureCollection",
      features: places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng)).map((place) => ({
        type: "Feature",
        properties: { placeId: place.id, count: place.count, name: placeName(place) },
        geometry: { type: "Point", coordinates: [place.lng, place.lat] }
      }))
    };
  }

  function routeGeoJson(places) {
    const coordinates = places
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
      .sort((a, b) => String(a.firstDate || "").localeCompare(String(b.firstDate || "")))
      .map((place) => [place.lng, place.lat]);
    return {
      type: "FeatureCollection",
      features: coordinates.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }] : []
    };
  }

  function updateMapData() {
    if (!state.mapReady) return;
    const places = getFilteredPlaces();
    state.map.getSource("places")?.setData(placesGeoJson(places));
    const routePlaces = state.album === "all" ? [] : places;
    state.map.getSource("journey-route")?.setData(routeGeoJson(routePlaces));
  }

  function fitFilteredPlaces() {
    if (!state.mapReady) return;
    const places = getFilteredPlaces().filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
    if (!places.length) return;
    if (places.length === 1) {
      state.map.easeTo({ center: [places[0].lng, places[0].lat], zoom: 5, duration: reducedMotion ? 0 : 1100 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    places.forEach((place) => bounds.extend([place.lng, place.lat]));
    state.map.fitBounds(bounds, { padding: 90, maxZoom: 4.5, duration: reducedMotion ? 0 : 1200 });
  }

  function selectRandomPlace() {
    const places = getFilteredPlaces();
    if (!places.length) return;
    const different = places.filter((place) => place.id !== state.selectedPlace?.id);
    const pool = different.length ? different : places;
    selectPlace(pool[Math.floor(Math.random() * pool.length)]);
  }

  function selectPlace(place) {
    state.selectedPlace = place;
    renderPlaces();
    el.app.classList.remove("map-expanded");
    if (state.mapReady && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
      state.map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(state.map.getZoom(), 5.3), duration: reducedMotion ? 0 : 1500, essential: false });
    } else if (!Number.isFinite(place.lat)) {
      showToast(t("unresolved"));
    }
    openDrawer(place);
  }

  async function openDrawer(place) {
    const requestId = ++state.drawerRequest;
    updateDrawerHeader(place);
    el["hero-copy"].classList.add("is-muted");
    el["place-drawer"].classList.add("open");
    el["place-drawer"].setAttribute("aria-hidden", "false");
    el["drawer-loading"].classList.remove("hidden");
    el["photo-grid"].innerHTML = "";
    el["empty-place"].classList.add("hidden");
    el["load-more"].classList.add("hidden");
    state.currentPhotos = [];
    state.visiblePhotos = 36;

    if (!place.dataUrl) {
      el["drawer-loading"].classList.add("hidden");
      el["empty-place"].classList.remove("hidden");
      return;
    }

    try {
      const response = await fetch(place.dataUrl);
      if (!response.ok) throw new Error(`Photo data request failed: ${response.status}`);
      const data = await response.json();
      if (requestId !== state.drawerRequest) return;
      state.currentPhotos = data.photos || [];
      el["drawer-loading"].classList.add("hidden");
      if (!state.currentPhotos.length) el["empty-place"].classList.remove("hidden");
      else renderPhotoGrid();
    } catch (error) {
      console.error(error);
      if (requestId !== state.drawerRequest) return;
      el["drawer-loading"].classList.add("hidden");
      el["empty-place"].classList.remove("hidden");
    }
  }

  function updateDrawerHeader(place) {
    const [a, b] = seedColors(place.id);
    el["drawer-hero"].style.setProperty("--seed-a", a);
    el["drawer-hero"].style.setProperty("--seed-b", b);
    el["drawer-hero"].style.backgroundImage = place.cover
      ? `linear-gradient(to top, rgba(10,23,20,.72), rgba(10,23,20,.04)), url("${encodeURI(place.cover)}")`
      : "";
    el["drawer-country"].textContent = countryName(place) || place.query;
    el["drawer-title"].textContent = placeName(place);
    el["drawer-count"].textContent = place.count > 0 ? `${formatNumber(place.count)} ${t("photoUnit")}` : t("demoPlace");
  }

  function renderPhotoGrid() {
    const visible = state.currentPhotos.slice(0, state.visiblePhotos);
    el["photo-grid"].innerHTML = visible.map((photo, index) => {
      const caption = photo.caption || placeName(state.selectedPlace);
      const ratio = photo.width && photo.height ? `${photo.width}/${photo.height}` : "4/3";
      return `
        <button class="photo-tile" data-photo-index="${index}" aria-label="${escapeHtml(caption)}" style="aspect-ratio:${ratio}">
          <img src="${encodeURI(photo.thumb)}" alt="${escapeHtml(caption)}" loading="lazy" decoding="async" />
          <figcaption>${escapeHtml(caption)}</figcaption>
        </button>`;
    }).join("");
    el["photo-grid"].querySelectorAll(".photo-tile").forEach((tile) => {
      tile.addEventListener("click", () => openLightbox(Number(tile.dataset.photoIndex)));
    });
    el["load-more"].classList.toggle("hidden", state.visiblePhotos >= state.currentPhotos.length);
  }

  function closeDrawer() {
    state.drawerRequest += 1;
    el["place-drawer"].classList.remove("open");
    el["place-drawer"].setAttribute("aria-hidden", "true");
    el["hero-copy"].classList.remove("is-muted");
  }

  function openLightbox(index) {
    if (!state.currentPhotos[index]) return;
    state.lightboxIndex = index;
    updateLightbox();
    el.lightbox.classList.add("open");
    el.lightbox.setAttribute("aria-hidden", "false");
  }

  function updateLightbox() {
    const photo = state.currentPhotos[state.lightboxIndex];
    if (!photo) return;
    el["lightbox-image"].src = photo.large || photo.thumb;
    el["lightbox-image"].alt = photo.caption || placeName(state.selectedPlace);
    el["lightbox-caption"].textContent = photo.caption || placeName(state.selectedPlace);
    const multiple = state.currentPhotos.length > 1;
    el["lightbox-prev"].classList.toggle("hidden", !multiple);
    el["lightbox-next"].classList.toggle("hidden", !multiple);
  }

  function stepLightbox(delta) {
    if (!state.currentPhotos.length) return;
    state.lightboxIndex = (state.lightboxIndex + delta + state.currentPhotos.length) % state.currentPhotos.length;
    updateLightbox();
  }

  function closeLightbox() {
    el.lightbox.classList.remove("open");
    el.lightbox.setAttribute("aria-hidden", "true");
    setTimeout(() => { el["lightbox-image"].src = ""; }, 220);
  }

  function resetWorld() {
    closeDrawer();
    el.app.classList.remove("map-expanded");
    state.selectedPlace = null;
    renderPlaces();
    fitFilteredPlaces();
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add("show");
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 3800);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
