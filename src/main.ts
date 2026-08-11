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

map.on('load', () => {
    // Add a new source from our GeoJSON data and
    // set the 'cluster' option to true. GL-JS will
    // add the point_count property to your source data.
    map.addSource('earthquakes', {
        type: 'geojson',
        // Point to GeoJSON data. This example visualizes all M1.0+ earthquakes
        // from 12/22/15 to 1/21/16 as logged by USGS' Earthquake hazards program.
        data: 'https://maplibre.org/maplibre-gl-js/docs/assets/earthquakes.geojson',
        cluster: true,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50 // Radius of each cluster when clustering points (defaults to 50)
    });

    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'earthquakes',
        filter: ['has', 'point_count'],
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
        id: 'cluster-count',
        type: 'symbol',
        source: 'earthquakes',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Regular'],
            'text-size': 12
        }
    });

    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'earthquakes',
        filter: ['!', ['has', 'point_count']],
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
        const source = map.getSource('earthquakes') as GeoJSONSource
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
});

const data = {} as any;

document.getElementById('nav-filter')?.addEventListener('change', (e) => {
    let filterOnValue = ['all'];
    let operator = '==';
    const target = e.target as HTMLInputElement;

    switch (target?.id) {
        /// example: `map.setFilter("earthquakes", ["any", [">", "felt", 16.0]])`
        case 'felt':
            let operatorFelt = document.getElementById('operator-felt') as HTMLSelectElement;
            let felt = document.getElementById('range-felt') as HTMLInputElement;
            operator = operatorFelt?.value;

            target?.checked ? data.felt = Number(felt?.value) : delete data['felt'];

            break;

        /// example: `map.setFilter("earthquakes", ["any", [">", "mag", 5.0]])`
        case 'mag':
            let operatorMag = document.getElementById('operator-mag') as HTMLSelectElement;
            let mag = document.getElementById('range-mag') as HTMLInputElement;
            operator = operatorMag?.value;

            target?.checked ? data.mag = Number(mag.value) : delete data['mag'];

            break;

        /// example: `map.setFilter("earthquakes", ["any", [">", "tsunami", 0]])`
        case 'tsunami':
            let tsunami = document.querySelector('input[type="radio"][name=tsunami]:checked') as HTMLInputElement;
            operator = '==';

            target.checked ? data.tsunami = Number(tsunami?.value) : delete data['tsunami'];

            break;
        default:
            console.log('default');
    }

    filterOnValue = Object.keys(data);

    let mapLibreFilterSpread = ['all', ...filterOnValue.map(id => [operator, id, data[id]])] as ExpressionSpecification;
    let mapLibreFilter = mapLibreFilterSpread;

    document.getElementById('filter-result')!!.textContent = JSON.stringify(mapLibreFilter);

    map.setFilter('earthquakes', mapLibreFilter);
});

