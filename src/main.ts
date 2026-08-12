import './style.css';
import MaplibreGLBasemapsControl from 'maplibre-gl-basemaps';
import 'maplibre-gl-basemaps/lib/basemaps.css'
import {Map, setWorkerUrl, AttributionControl, GeoJSONSource, Popup} from 'maplibre-gl';
import type { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY;

const map = new Map({
    container: 'map',
    style: {version: 8, sources: {}, layers: []},
    center: [0, 0],
    zoom: 1,
    attributionControl: false,
});

map.addControl(new AttributionControl({ compact: true }), "bottom-right");
map.addControl(
    new MaplibreGLBasemapsControl(
        {
            basemaps: [
                {
                    id: "Satellite",
                    tiles: [`https://api.maptiler.com/maps/hybrid-v4/256/{z}/{x}/{y}.jpg?key=${maptilerKey}`],
                    sourceExtraParams: {
                        tileSize: 256,
                        attribution: "&copy; MapTiler",
                    }
                },
                {
                    id: "Streets",
                    tiles: [`https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${maptilerKey}`],
                    sourceExtraParams: {
                        tileSize: 256,
                        attribution: "&copy; MapTiler",
                    }
                },
                {
                    id: "General",
                    tiles: [`https://api.maptiler.com/maps/base-v4/256/{z}/{x}/{y}.png?key=${maptilerKey}`],
                    sourceExtraParams: {
                        tileSize: 256,
                        attribution: "&copy; MapTiler",
                    }
                },
            ],
            initialBasemap: "General",
            expandDirection: "top"
        }
    ),
    "bottom-left"
);

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

function createLayers(featureCollection: any) {
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
                20,
                100,
                30,
                750,
                40
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
            'circle-radius': 4,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff'
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
        const coordinates = feat?.geometry.coordinates.slice();
        const mag = feat?.properties.mag;
        let tsunami;

        if (feat?.properties.tsunami === 1) {
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

        new Popup()
            .setLngLat(coordinates)
            .setHTML(
                `magnitude: ${mag}<br>Was there a tsunami?: ${tsunami}`
            )
            .addTo(map);
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

let fetchedData: any | null = null;

map.on('load', () => {
    fetch('https://maplibre.org/maplibre-gl-js/docs/assets/earthquakes.geojson').then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    }).then(data => {
        fetchedData = data;
        createLayers(fetchedData!!);
    });
});

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
let tsunamiCheckState = false;

document.getElementById('nav-filter')?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;

    let filterMag: MagnitudeComparison | null = null;
    let filterTsunami: number | null = null;
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

        case 'tsunami':
        case 't0':
        case 't1':
            let tsunami = document.getElementById('tsunami') as HTMLInputElement;
            let radio = document.querySelector('input[type="radio"][name=tsunami]:checked') as HTMLInputElement | null;

            if (radio !== null && tsunami.checked) {
                tsunamiCheckState = true;
                filterTsunami = Number(radio.value).valueOf();
            } else if (tsunamiCheckState === true) {
                tsunamiCheckState = false;
                unchecked = true;
            }

            break;
        default:
            console.log('default');
    }

    if (filterMag || filterTsunami !== null || unchecked === true) {
        updateLayers(filterMag, filterTsunami)
    }
});

function updateLayers(mag: MagnitudeComparison | null, tsunami: number | null) {
    if (!fetchedData) return;

    let filteredData = {
        type: 'FeatureCollection',
        crs: fetchedData.crs,
        features: fetchedData.features,
    };
    if (mag !== null) {
        filteredData.features = filteredData.features.filter((f: any) => mag.comparison(f.properties.mag, mag.mag));
    }

    if (tsunami !== null) {
        filteredData.features = filteredData.features.filter((f: any) => f.properties.tsunami == tsunami)
    }

    (map.getSource('earthquakes-clustered') as GeoJSONSource).setData(filteredData);
}
