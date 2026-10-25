import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { GeoPoint, NearbyClinic } from '../services/clinicSearch';

interface Props {
  center: GeoPoint;
  clinics: NearbyClinic[];
  title?: string;
}

function mapHtml(center: GeoPoint, clinics: NearbyClinic[]) {
  const payload = JSON.stringify({
    center,
    clinics: clinics.map((clinic) => ({
      name: clinic.name,
      kind: clinic.kind,
      rating: clinic.rating,
      lat: clinic.latitude,
      lon: clinic.longitude,
    })),
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; background: #F6F0E4; }
    .leaflet-popup-content-wrapper, .leaflet-popup-tip {
      background: #FFFDF8; color: #141414; border: 2px solid #141414; border-radius: 12px;
    }
    .popup-name { font-weight: 800; margin-bottom: 2px; }
    .popup-meta { color: #6E675F; font-size: 12px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const data = ${payload};
    const map = L.map('map', { zoomControl: true, attributionControl: true })
      .setView([data.center.latitude, data.center.longitude], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
    data.clinics.forEach((clinic) => {
      L.circleMarker([clinic.lat, clinic.lon], {
        radius: 9,
        color: '#141414',
        weight: 2,
        fillColor: '#7A6B8A',
        fillOpacity: 1
      }).addTo(map).bindPopup(
        '<div class="popup-name">' + esc(clinic.name) + '</div>' +
        '<div class="popup-meta">' + esc(clinic.kind) + ' · ' + clinic.rating.toFixed(1) + ' / 5</div>'
      );
    });
    L.circleMarker([data.center.latitude, data.center.longitude], {
      radius: 11,
      color: '#141414',
      weight: 3,
      fillColor: '#FFFDF8',
      fillOpacity: 1
    }).addTo(map).bindPopup('<div class="popup-name">You are here</div>');
    L.circleMarker([data.center.latitude, data.center.longitude], {
      radius: 4,
      color: '#141414',
      weight: 0,
      fillColor: '#141414',
      fillOpacity: 1
    }).addTo(map);
  </script>
</body>
</html>`;
}

export const ClinicsMap: React.FC<Props> = ({ center, clinics, title = 'Caregivers map' }) => {
  const html = mapHtml(center, clinics);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        {React.createElement('iframe', {
          title,
          srcDoc: html,
          style: {
            width: '100%',
            height: '100%',
            border: '0',
          },
        })}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    height: 420,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#EDE4D4',
  },
});
