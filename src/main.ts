import './style.css';
import MaplibreGLBasemapsControl from 'maplibre-gl-basemaps';
import 'maplibre-gl-basemaps/lib/basemaps.css'
import {Map, setWorkerUrl, AttributionControl, GeoJSONSource, Popup} from 'maplibre-gl';
import type { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY;
const dataURL = import.meta.env.VITE_DATA_URL;
const googleAPIKey = import.meta.env.VITE_GOOGLE_API_KEY;
const driveFolderID = import.meta.env.VITE_DRIVE_FOLDER_ID;
const quotaUserID = generateUrlFriendlyString();
const driveURL = `https://www.googleapis.com/drive/v3/files?q='${driveFolderID}'+in+parents+and+mimeType+contains+'image/'+and+trashed+=+false&pageSize=1000&orderBy=name_natural&fields=files(name,+id)&quotaUser=${quotaUserID}&key=${googleAPIKey}`

const satelliteBasemap = {
    id: "Satellite",
    tiles: [`https://api.maptiler.com/maps/hybrid-v4/256/{z}/{x}/{y}.jpg?key=${maptilerKey}`],
    sourceExtraParams: {
        tileSize: 256,
        attribution: "&copy; MapTiler",
    }
}
const streetsBasemap = {
    id: "Streets",
    tiles: [`https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${maptilerKey}`],
    sourceExtraParams: {
        tileSize: 256,
        attribution: "&copy; MapTiler",
    }
}
const generalBasemap = {
    id: "General",
    tiles: [`https://api.maptiler.com/maps/base-v4/256/{z}/{x}/{y}.png?key=${maptilerKey}`],
    sourceExtraParams: {
        tileSize: 256,
        attribution: "&copy; MapTiler",
    }
}

function addPortraitBasemapControl(addTo: Map) {
    let ctrl = new MaplibreGLBasemapsControl({
        basemaps: [
            satelliteBasemap,
            streetsBasemap,
            generalBasemap,
        ],
        initialBasemap: "General",
        expandDirection: "top"
    });
    addTo.addControl(ctrl, 'bottom-left');
}

function addLandscapeBasemapControl(addTo: Map) {
    let ctrl = new MaplibreGLBasemapsControl({
        basemaps: [
            generalBasemap,
            streetsBasemap,
            satelliteBasemap,
        ],
        initialBasemap: "General",
        expandDirection: "left"
    });
    addTo.addControl(ctrl, 'top-right');
}

function setBasemapControl(addTo: Map) {
    if (window.matchMedia("(orientation: portrait)").matches) {
        addPortraitBasemapControl(addTo);
    } else if (window.matchMedia("(orientation: landscape)").matches) {
        addLandscapeBasemapControl(addTo);
    } else {
        addPortraitBasemapControl(addTo);
    }
}

class FilterControl {
    _map: any;
    _container: any;
    onAdd(map: any) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

        this._container.innerHTML = `
        <nav class="navbar">
            <!-- Hidden checkbox to manage the toggle state -->
            <input type="checkbox" id="menu-toggle" class="menu-checkbox">

            <!-- Hamburger icon linked to the checkbox -->
            <label for="menu-toggle" class="hamburger">
                <span></span>
                <span></span>
                <span></span>
            </label>
            <div class="map-overlay filters">
                <div class="map-overlay-inner menu-content">
                    <nav>
                        <fieldset id="container-mag">
                            <legend>📈 Magnitude</legend>
                            <div>
                                <input id="mag" type="checkbox" />
                                <label for="mag">Apply <code><b>magnitude</b></code> Filter</label>
                                <div>
                                    <div>
                                        <label for="operator-mag">Operator:</label>
                                        <select name="operator" id="operator-mag">
                                            <option value=">">&gt;</option>
                                            <option value="==" selected>==</option>
                                            <option value="<">&lt;</option>
                                        </select>
                                        <br>
                                        <label for="range-mag">Magnitude:</label>
                                        <input type="number" id="range-mag" name="range" value="2.71" min="0.0" max="100" />
                                    </div>
                                </div>
                        </fieldset>
                        <fieldset id="container-tsunami">
                            <legend>🌊 Tsunami</legend>
                            <input id="tsunami" type="checkbox" />
                            <label for="tsunami">Apply <code><b>tsunami</b></code> filter</label>
                            <div id="radio-tsunamis">
                                <input type="radio" id="t0" name="tsunami" value="1" /><label for="t0">Tsunamis Only</label>
                                <input type="radio" id="t1" name="tsunami" value="0" /><label for="t1">Non-Tsunamis Only</label>
                            </div>
                        </fieldset>
                        <fieldset id="container-identifier">
                            <legend>🪪 ID</legend>
                            <input id="identifier" type="checkbox" />
                            <label for="identifier">Apply <code><b>ID</b></code> filter</label>
                            <div>
                                <input id="input-identifier" type="search" name="identifier" placeholder="Filter by ID" />
                            </div>
                        </fieldset>
                    </nav>
                </div>
            </div>
        </nav>`;

        return this._container;
  }

  onRemove() {
    this._container.remove();
  }
}

type ImageID = {
    name: string;
    id: string;
}

let currentMap: Map | null;
let fetchedData: any | null = null;
let fetchedImageIDs: ImageID[] | null  = null;

function createMap(): Map {
    if (currentMap) {
        removeLayers(currentMap);
        currentMap.remove();
        currentMap = null;
    }

    const newMap = new Map({
        container: 'map',
        style: {version: 8, sources: {}, layers: []},
        center: [0, 0],
        zoom: 1,
        attributionControl: false,
    });

    setBasemapControl(newMap);
    newMap.addControl(new AttributionControl({ compact: true }), "bottom-right");
    newMap.addControl(new FilterControl(), 'top-left');

    newMap.on('load', () => {
        if (fetchedData && fetchedImageIDs) {
            createLayers(newMap, fetchedData, fetchedImageIDs);
            return;
        }

        const dataPromise = fetchErrorCheck(dataURL).then(response => {
            return response.text();
        }).then(async (data) => {
            return dataCSVToFeatureCollection(data);
        });
        const imageIDsPromise = fetchErrorCheck(driveURL).then(response => {
            return response.json();
        }).then(async (data) => {
            return imageIDsJSONToArray(data);
        });

        Promise.all([dataPromise, imageIDsPromise]).then(([csv, arr]) => {
            fetchedData = csv;
            fetchedImageIDs = arr;
            createLayers(newMap, fetchedData!!, fetchedImageIDs!!);
        });
    });

    return newMap;
}

function fetchErrorCheck(url: string): Promise<Response> {
    return fetch(url).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response;
    })
}

currentMap = createMap();

window.matchMedia("(orientation: portrait)").addEventListener("change", _e => {
    currentMap = createMap();
});

const hasPointCountFilter: ExpressionSpecification = ['has', 'point_count'];
const notPointCountFilter: ExpressionSpecification = ['!', ['has', 'point_count']];
const clustersID = 'clusters' as const;
const clusterCountID = 'cluster-count' as const;
const unclusteredPointID = 'unclustered-point' as const;

function createSource(featureCollection: any) {
    return {
        type: 'geojson',
        // Point to GeoJSON data. This example visualizes all M1.0+ earthquakes
        // from 12/22/15 to 1/21/16 as logged by USGS' Earthquake hazards program.
        data: featureCollection,
        cluster: true,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50 // Radius of each cluster when clustering points (defaults to 50)
    } as const;
}

function removeLayers(map: Map) {
    map.removeLayer(clustersID);
    map.removeLayer(clusterCountID);
    map.removeLayer(unclusteredPointID);
}

function createLayers(map: Map, featureCollection: any, imageIDs: ImageID[]) {
    // Add a new source from our GeoJSON data and
    // set the 'cluster' option to true. GL-JS will
    // add the point_count property to your source data.
    map.addSource('earthquakes-clustered', createSource(featureCollection));

    map.addLayer({
        id: clustersID,
        type: 'circle',
        source: 'earthquakes-clustered',
        filter: hasPointCountFilter,
        paint: {
            // Use step expressions (https://maplibre.org/maplibre-style-spec/#expressions-step)
            // with three steps to implement three types of circles:
            //   * Blue, 20px circles when point count is less than 100
            //   * Yellow, 30px circles when point count is between 100 and 750
            //   * Pink, 40px circles when point count is greater than or equal to 750
            'circle-color': [
                'step',
                ['get', 'point_count'],
                '#51bbd6',
                100,
                '#f1f075',
                750,
                '#f28cb1'
            ],
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                25,
                100,
                35,
                750,
                45
            ]
        }
    });

    map.addLayer({
        id: clusterCountID,
        type: 'symbol',
        source: 'earthquakes-clustered',
        filter: hasPointCountFilter,
        layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Regular'],
            'text-size': 12
        }
    });

    map.addLayer({
        id: unclusteredPointID,
        type: 'circle',
        source: 'earthquakes-clustered',
        filter: notPointCountFilter,
        paint: {
            'circle-color': '#11b4da',
            'circle-radius': 8,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#000'
        }
    });

    // inspect a cluster on click
    map.on('click', 'clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['clusters']
        });
        const clusterId = features[0].properties.cluster_id;
        const source = map.getSource('earthquakes-clustered') as GeoJSONSource
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
            center: features[0].geometry.coordinates,
            zoom
        });
    });

    // When a click event occurs on a feature in
    // the unclustered-point layer, open a popup at
    // the location of the feature, with
    // description HTML from its properties.
    map.on('click', 'unclustered-point', (e) => {
        const feat = e.features?.[0];
        if (!feat) return;

        const id = feat.properties.id;
        const coords = feat.geometry.coordinates;
        const coordinates = coords.slice();
        const mag = feat.properties.mag;
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const date = formatter.format(new Date(feat.properties.time));

        let tsunami;
        if (feat.properties.tsunami === 1) {
            tsunami = 'yes';
        } else {
            tsunami = 'no';
        }

        // Ensure that if the map is zoomed out such that
        // multiple copies of the feature are visible, the
        // popup appears over the copy being pointed to.
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        driveImageURLsFromDataID(id, imageIDs).then(async (urls) => {
            const promises: Promise<string>[] = [];
            urls.forEach((url) => {
                promises.push(cacheImage(url));
            });

            return Promise.all(promises);
        }).then(cached => {
            let imagesHTML = '<div style="display: flex; overflow-x: auto; gap: 8px; width: 100%;">';
            cached.forEach((objURL) => {
                imagesHTML += `<img src="${objURL}" style="height: 100%; max-height: 200px; width: auto; flex-shrink: 0;">`
            });
            imagesHTML += '</div>'

            new Popup()
                .setLngLat(coordinates)
                .setHTML(
                    `<div>ID: ${id}<br>Magnitude: ${mag}<br>Tsunami: ${tsunami}<br>LatLon: (${coords[1].toFixed(4)}, ${coords[0].toFixed(4)})<br>Date: ${date} UTC</div>${imagesHTML}`
                )
                .addTo(map);
        });
    });

    map.on('mouseenter', 'unclustered-point', () => {
        map.getCanvas().style.cursor = 'pointer';

    });
    map.on('mouseleave', 'unclustered-point', () => {
        map.getCanvas().style.cursor = '';
    });

    map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
    });
}

const cacheName = 'fibershed-example-cache-v1';

async function cacheImage(url: string): Promise<string> {
    const cache = await caches.open(cacheName);
    let response = await cache.match(url);

    if (!response) {
        response = await fetch(url);
        await cache.put(url, response.clone());
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

function dataCSVToFeatureCollection(csv: string): any {
    let fc: { type: string, features: any[] } = {
        type: 'FeatureCollection',
        features: [],
    };
    const lines = csv.split('\n').map((line: string) => line.trim()).filter(Boolean);
    if (lines.length === 0) return fc

    // Extract headers
    const headers = lines[0].split(',');

    // Process data lines
    fc.features = lines.slice(1).map(line => {
        let feature: { type: string, geometry: { type: string, coordinates: number[] }, properties: { [key: string]: any; } } = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [0.0, 0.0, 0.0],
            },
            properties: {},
        };
        const values = line.split(',');

        headers.forEach((header, index) => {
            const value = values[index] ?? '';
            switch (header) {
                case 'X':
                    feature.geometry.coordinates[0] = parseFloat(value);
                    break;
                case 'Y':
                    feature.geometry.coordinates[1] = parseFloat(value);
                    break;
                case 'Z':
                    feature.geometry.coordinates[2] = parseFloat(value);
                    break;
                case 'id':
                    feature.properties.id = value;
                    break;
                case 'mag':
                    feature.properties.mag = parseFloat(value);
                    break;
                case 'time':
                    feature.properties.time = parseInt(value);
                    break;
                case 'tsunami':
                    feature.properties.tsunami = parseInt(value);
                    break;
            }
        });

        return feature;
    });

    return fc;
}

function imageIDsJSONToArray(imageIDsJSON: any): ImageID[] {
    const imageIDs: ImageID[] = [];

    if (!imageIDsJSON || !(imageIDsJSON.files) || !(imageIDsJSON.files.length)) {
        console.log("Could not fetch image information from drive, images may not appear.");
        return imageIDs;
    }

    imageIDsJSON.files.forEach((file: any) => {
        imageIDs.push({name: file.name, id: file.id});
    });

    return imageIDs;
}

async function driveImageURLsFromDataID(dataID: string, imageIDs: ImageID[]): Promise<string[]> {
    return imageIDs.reduce((acc, imageID) => {
        if (imageID.name.includes(dataID)) {
            acc.push(`https://www.googleapis.com/drive/v3/files/${imageID.id}?alt=media&quotaUser=${quotaUserID}&key=${googleAPIKey}`);
        }
        return acc;
    }, [] as string[]);
}

interface MagnitudeComparison {
    mag: number;
    comparison: (a: number, b: number) => boolean;
}

const operators = {
  '>':   (a: number, b: number) => a > b,
  '==': (a: number, b: number) => a == b,
  '<':   (a: number, b: number) => a < b,
};

let magCheckState = false;
let magFilterFunc: ((f: any) => boolean) | null = null;
document.getElementById('container-mag')?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;

    let filterMag: MagnitudeComparison | null = null;
    let unchecked = false;

    switch (target.id) {
        case 'mag':
        case 'operator-mag':
        case 'range-mag':
            let mag = document.getElementById('mag') as HTMLInputElement;
            let operatorMag = document.getElementById('operator-mag') as HTMLSelectElement;
            let rangeMag = document.getElementById('range-mag') as HTMLInputElement;
            let operator = operatorMag.value as keyof typeof operators;

            if (mag.checked) {
                magCheckState = true;
                filterMag = {
                    mag: Number(rangeMag.value).valueOf(),
                    comparison: operators[operator] as (a: number, b: number) => boolean,
                };
            } else if (magCheckState === true) {
                magCheckState = false;
                unchecked = true;
            }

            break;

        default:
            console.log('default');
    }

    if (filterMag !== null) {
        magFilterFunc = (f) => filterMag.comparison(f.properties.mag, filterMag.mag);
        updateLayers();
    } else if (unchecked) {
        magFilterFunc = null;
        updateLayers();
    }
});

let tsunamiCheckState = false;
let tsunamiFilterFunc: ((f: any) => boolean) | null = null;
document.getElementById('container-tsunami')?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    let filterTsunami: number | null = null;
    let unchecked = false;

    switch (target.id) {
        case 'tsunami':
        case 't0':
        case 't1':
            let tsunami = document.getElementById('tsunami') as HTMLInputElement;
            let radio = document.querySelector('input[type="radio"][name=tsunami]:checked') as HTMLInputElement | null;

            if (radio !== null && tsunami.checked) {
                tsunamiCheckState = true;
                filterTsunami = Number(radio.value).valueOf();
            } else if (!tsunami.checked && tsunamiCheckState === true) {
                tsunamiCheckState = false;
                unchecked = true;
            }

            break;

        default:
            console.log('default');
    }

    if (filterTsunami !== null){
        tsunamiFilterFunc = (f) => f.properties.tsunami == filterTsunami;
        updateLayers();
    } else if (unchecked === true) {
        tsunamiFilterFunc = null;
        updateLayers();
    }
});

let identifierCheckState = false;
let previousIdentifierInput = '';
let identifierFilterFunc: ((f: any) => boolean) | null = null;
function handleIdentifierEvent(e: Event) {
    const target = e.target as HTMLInputElement;

    let filterIdentifier: string | null = null;
    let unchecked = false;

    switch (target.id) {
        case 'identifier':
        case 'input-identifier':
            let identifier = document.getElementById('identifier') as HTMLInputElement;
            let inputIdentifier = document.getElementById('input-identifier') as HTMLInputElement;

            const inputValue = inputIdentifier.value.trim().toLowerCase();
            if (inputValue !== previousIdentifierInput && identifier.checked) {
                identifierCheckState = true;
                filterIdentifier = inputValue;
                previousIdentifierInput = inputValue;
            } else if (!identifier.checked && identifierCheckState === true) {
                identifierCheckState = false;
                previousIdentifierInput = '';
                unchecked = true;
            }

            break;

        default:
            console.log('default');
    }

    if (filterIdentifier !== null) {
        identifierFilterFunc = (f) => f.properties.id.indexOf(filterIdentifier) > -1;
        updateLayers();
    } else if (unchecked === true) {
        identifierFilterFunc = null;
        updateLayers();
    }
}
document.getElementById('container-identifier')?.addEventListener('keyup', handleIdentifierEvent);
document.getElementById('container-identifier')?.addEventListener('change', handleIdentifierEvent);

function updateLayers() {
    if (!fetchedData) return;

    let filteredData = {
        type: 'FeatureCollection',
        crs: fetchedData.crs,
        features: fetchedData.features,
    };

    if (magFilterFunc !== null) {
        filteredData.features = filteredData.features.filter(magFilterFunc);
    }

    if (tsunamiFilterFunc !== null) {
        filteredData.features = filteredData.features.filter(tsunamiFilterFunc);
    }

    if (identifierFilterFunc !== null) {
        filteredData.features = filteredData.features.filter(identifierFilterFunc);
    }

    (currentMap?.getSource('earthquakes-clustered') as GeoJSONSource).setData(filteredData);
}

const menu = document.querySelector(".menu");

menu?.addEventListener("click", () => {
    const activeElements = document.querySelectorAll(".active-element");
    console.log(activeElements);
    for(let i = 0; i < activeElements.length; i++) {
        activeElements[i].classList.toggle("active");
    }
});

function generateUrlFriendlyString(length: number = 21): string {
  // Define strictly URL-safe characters (RFC 3986 unreserved characters)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const charsLength = chars.length;

  // Create a typed array to hold random byte values
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);

  let result = '';
  for (let i = 0; i < length; i++) {
    // Map each random byte to an index in our character string
    result += chars[randomBytes[i] % charsLength];
  }

  return result;
}
