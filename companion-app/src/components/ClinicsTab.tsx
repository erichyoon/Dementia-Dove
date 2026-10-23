import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { FolderCard } from './FolderCard';
import { ClinicsMap } from './ClinicsMap';
import { colors, shadow } from '../theme';
import {
  GeoPoint,
  NearbyClinic,
  findClinicsNear,
  reverseGeocodeLabel,
  geocodeCity,
} from '../services/clinicSearch';
import {
  ClinicAppointment,
  getAppointments,
  saveAppointment,
} from '../services/appointmentStorage';

const TIME_SLOTS = ['9:00 AM', '10:30 AM', '1:00 PM', '2:30 PM', '4:00 PM'];

function upcomingDays() {
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i + 1);
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  });
}

const StarRating: React.FC<{ rating: number; reviews: number }> = ({ rating, reviews }) => (
  <View style={styles.starsRow}>
    {[1, 2, 3, 4, 5].map((star) => {
      const filled = rating >= star;
      const half = !filled && rating >= star - 0.5;
      return (
        <Ionicons
          key={star}
          name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
          size={15}
          color={colors.accent}
        />
      );
    })}
    <Text style={styles.ratingText}>
      {rating.toFixed(1)} / 5 · {reviews} reviews
    </Text>
  </View>
);

export const ClinicsTab: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'locating' | 'searching' | 'ready' | 'denied' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string>('');
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [clinics, setClinics] = useState<NearbyClinic[]>([]);
  const [cityQuery, setCityQuery] = useState('');
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [bookingClinic, setBookingClinic] = useState<NearbyClinic | null>(null);
  const [selectedDay, setSelectedDay] = useState(upcomingDays()[0].key);
  const [selectedTime, setSelectedTime] = useState(TIME_SLOTS[0]);
  const [showMap, setShowMap] = useState(false);
  const days = upcomingDays();

  useEffect(() => {
    getAppointments().then(setAppointments);
  }, []);

  const loadClinicsAt = async (here: GeoPoint, labelHint?: string) => {
    setPoint(here);
    setStatus('searching');
    const [label, results] = await Promise.all([
      labelHint ? Promise.resolve(labelHint) : reverseGeocodeLabel(here),
      findClinicsNear(here),
    ]);
    setPlaceLabel(label);
    setClinics(results);
    setStatus('ready');
  };

  const readDeviceLocation = async (): Promise<GeoPoint> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          () => reject(new Error('Location permission was not granted.')),
          { enableHighAccuracy: false, timeout: 10000 }
        );
      });
    }

    throw new Error('Location permission was not granted.');
  };

  const searchNearMe = async () => {
    setErrorText(null);
    setStatus('locating');
    try {
      const here = await readDeviceLocation();
      await loadClinicsAt(here);
    } catch (err: any) {
      setStatus('denied');
      setErrorText(err?.message || 'Could not read your location.');
    }
  };

  const searchByCity = async () => {
    setErrorText(null);
    setStatus('searching');
    try {
      const found = await geocodeCity(cityQuery);
      if (!found) {
        setStatus('error');
        setErrorText('No place matched that city. Try a nearby town name.');
        return;
      }
      await loadClinicsAt(found.point, found.label);
    } catch (err: any) {
      setStatus('error');
      setErrorText(err?.message || 'Could not search that city.');
    }
  };

  useEffect(() => {
    searchNearMe();
  }, []);

  const appointmentFor = (clinicId: string) =>
    appointments.find((item) => item.clinicId === clinicId);

  const confirmAppointment = async () => {
    if (!bookingClinic) return;
    const day = days.find((item) => item.key === selectedDay);
    const saved = await saveAppointment({
      clinicId: bookingClinic.id,
      clinicName: bookingClinic.name,
      clinicAddress: bookingClinic.address,
      dateLabel: day?.label || selectedDay,
      timeLabel: selectedTime,
    });
    setAppointments((current) => [saved, ...current.filter((item) => item.clinicId !== saved.clinicId)]);
    setBookingClinic(null);
  };

  const openDirections = (clinic: NearbyClinic) => {
    const dest = `${clinic.latitude},${clinic.longitude}`;
    const url =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?daddr=${dest}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Care nearby.{'\n'}Walk in anytime.</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={showMap ? 'Show clinic list' : 'View clinics on map'}
            style={[styles.refreshBtn, showMap && styles.refreshBtnOn]}
            onPress={() => setShowMap((value) => !value)}
            activeOpacity={0.85}
            disabled={!point || clinics.length === 0}
          >
            <Ionicons name="map" size={16} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Use my location"
            style={styles.refreshBtn}
            onPress={searchNearMe}
            activeOpacity={0.85}
          >
            <Ionicons name="locate" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FolderCard>
          <View style={styles.locationCard}>
            <View style={styles.pinBox}>
              <Ionicons name="navigate" size={18} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationKicker}>Your location</Text>
              <Text style={styles.locationValue}>
                {status === 'locating' && 'Asking for location…'}
                {status === 'searching' && 'Searching clinics around you…'}
                {status === 'ready' && (placeLabel || `${point?.latitude.toFixed(3)}, ${point?.longitude.toFixed(3)}`)}
                {status === 'denied' && 'Location is turned off'}
                {status === 'error' && 'Location unavailable'}
                {status === 'idle' && 'Not requested yet'}
              </Text>
            </View>
          </View>
        </FolderCard>

        {(status === 'locating' || status === 'searching') && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>
              {status === 'locating' ? 'Accessing your location' : 'Finding clinics within 6 km'}
            </Text>
          </View>
        )}

        <FolderCard>
          <View style={styles.cityCard}>
            <Text style={styles.cityLabel}>Or search a city</Text>
            <View style={styles.cityRow}>
              <TextInput
                value={cityQuery}
                onChangeText={setCityQuery}
                placeholder="Chicago, IL"
                placeholderTextColor={colors.muted}
                style={styles.cityInput}
                onSubmitEditing={searchByCity}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.cityBtn} onPress={searchByCity} activeOpacity={0.85}>
                <Text style={styles.cityBtnText}>Find</Text>
              </TouchableOpacity>
            </View>
          </View>
        </FolderCard>

        {(status === 'denied' || status === 'error') && (
          <View style={styles.emptyCard}>
            <Ionicons name="warning-outline" size={22} color={colors.ink} />
            <Text style={styles.emptyTitle}>Couldn’t use GPS</Text>
            <Text style={styles.emptyDesc}>{errorText}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={searchNearMe}>
              <Text style={styles.primaryBtnText}>Try location again</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'ready' && showMap && point && clinics.length > 0 && (
          <FolderCard>
            <View>
              <View style={styles.mapLegend}>
                <View style={styles.legendItem}>
                  <View style={styles.youDot} />
                  <Text style={styles.legendText}>You</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.clinicDot} />
                  <Text style={styles.legendText}>Clinic</Text>
                </View>
              </View>
              <ClinicsMap center={point} clinics={clinics} />
            </View>
          </FolderCard>
        )}

        {status === 'ready' && clinics.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No clinics in range</Text>
            <Text style={styles.emptyDesc}>
              Nothing mapped within 6 km of this spot. Move closer to a town center and search again.
            </Text>
          </View>
        )}

        {status === 'ready' &&
          !showMap &&
          clinics.map((clinic) => (
            <FolderCard key={clinic.id}>
              <View style={styles.clinicCard}>
                <View style={styles.clinicTop}>
                  <View style={styles.kindPill}>
                    <Text style={styles.kindText}>{clinic.kind.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.distance}>
                    {clinic.distanceKm < 1
                      ? `${Math.round(clinic.distanceKm * 1000)} m`
                      : `${clinic.distanceKm.toFixed(1)} km`}
                  </Text>
                </View>
                <Text style={styles.clinicName}>{clinic.name}</Text>
                <StarRating rating={clinic.rating} reviews={clinic.reviewCount} />
                <Text style={styles.clinicAddr}>{clinic.address}</Text>
                {appointmentFor(clinic.id) ? (
                  <Text style={styles.bookedNote}>
                    Booked · {appointmentFor(clinic.id)?.dateLabel} at {appointmentFor(clinic.id)?.timeLabel}
                  </Text>
                ) : null}
                <View style={styles.clinicActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setSelectedDay(days[0].key);
                      setSelectedTime(TIME_SLOTS[0]);
                      setBookingClinic(clinic);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="calendar" size={14} color={colors.white} />
                    <Text style={styles.actionText}>
                      {appointmentFor(clinic.id) ? 'Reschedule' : 'Schedule'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtnGhost}
                    onPress={() => openDirections(clinic)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="map-outline" size={14} color={colors.ink} />
                    <Text style={styles.actionGhostText}>Directions</Text>
                  </TouchableOpacity>
                  {clinic.phone ? (
                    <TouchableOpacity
                      style={styles.actionBtnGhost}
                      onPress={() => Linking.openURL(`tel:${clinic.phone}`)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="call-outline" size={14} color={colors.ink} />
                      <Text style={styles.actionGhostText}>Call</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </FolderCard>
          ))}
      </ScrollView>

      <Modal visible={!!bookingClinic} transparent animationType="fade" onRequestClose={() => setBookingClinic(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalKicker}>SCHEDULE APPOINTMENT</Text>
            <Text style={styles.modalTitle}>{bookingClinic?.name}</Text>
            <Text style={styles.modalAddr}>{bookingClinic?.address}</Text>

            <Text style={styles.slotLabel}>Day</Text>
            <View style={styles.chipWrap}>
              {days.map((day) => (
                <TouchableOpacity
                  key={day.key}
                  style={[styles.chip, selectedDay === day.key && styles.chipOn]}
                  onPress={() => setSelectedDay(day.key)}
                >
                  <Text style={[styles.chipText, selectedDay === day.key && styles.chipTextOn]}>{day.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.slotLabel}>Time</Text>
            <View style={styles.chipWrap}>
              {TIME_SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot}
                  style={[styles.chip, selectedTime === slot && styles.chipOn]}
                  onPress={() => setSelectedTime(slot)}
                >
                  <Text style={[styles.chipText, selectedTime === slot && styles.chipTextOn]}>{slot}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setBookingClinic(null)}>
                <Text style={styles.actionGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmAppointment}>
                <Text style={styles.actionText}>Book visit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  refreshBtnOn: {
    backgroundColor: colors.ink,
  },
  mapLegend: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  youDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  clinicDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  pinBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  locationValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 2,
  },
  cityCard: {
    padding: 16,
  },
  cityLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  cityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cityInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: '700',
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  cityBtn: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  cityBtnText: {
    color: colors.white,
    fontWeight: '800',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    color: colors.muted,
    fontWeight: '700',
  },
  emptyCard: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 18,
    backgroundColor: colors.white,
    padding: 24,
    alignItems: 'center',
    marginVertical: 8,
    ...shadow.hard,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: colors.white,
    fontWeight: '800',
  },
  clinicCard: {
    padding: 16,
  },
  clinicTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kindPill: {
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 0.4,
  },
  distance: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
  },
  clinicName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
  },
  clinicAddr: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 6,
  },
  ratingText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  bookedNote: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  clinicActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,20,20,0.45)',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 22,
    padding: 18,
    ...shadow.hard,
  },
  modalKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.7,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.ink,
    marginTop: 4,
  },
  modalAddr: {
    color: colors.muted,
    marginTop: 4,
    marginBottom: 12,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
    marginTop: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  chipOn: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontWeight: '800',
    fontSize: 12,
    color: colors.ink,
  },
  chipTextOn: {
    color: colors.white,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
  },
  modalCancel: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalConfirm: {
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 12,
  },
  actionBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionGhostText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 12,
  },
});
