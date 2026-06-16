import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Modal,
  Image,
  FlatList,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import { supabase } from '../lib/supabase';

const { width: screenWidth } = Dimensions.get('window');

type AspectRatio = '9:16' | '16:9' | '1:1';
type ActiveTab = 'none' | 'modifier' | 'audio' | 'texte' | 'effets' | 'filtres' | 'ajuster' | 'format' | 'collage';
type AudioModalTab = 'library' | 'import' | 'extract' | 'controls';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Clip {
  id: string;
  name: string;
  start: number;
  duration: number;
  color: string;
  keyframes?: number[];
  // Audio
  volume?: number;    // 0-200
  muted?: boolean;
  fadeIn?: boolean;
  fadeOut?: boolean;
  uri?: string;       // chemin réel si importé/extrait
  audioSource?: 'library' | 'import' | 'extracted';
}

interface TextClip extends Clip {
  fontSize: number;
  textColor: string;
  positionY: number;
}

// Nouvelle interface pour les photos importées
interface PhotoAsset {
  id: string;
  uri: string;
  name: string;
}

// Type de layout pour le collage
type CollageLayout = '2x1' | '1x2' | '2x2' | '3x1' | 'main+2';

interface CollageSlot {
  photoId: string | null; // null = vide
  flex: number;           // proportion de l'espace
}

interface CollageConfig {
  layout: CollageLayout;
  slots: CollageSlot[];
  duration: number; // secondes affichées sur la timeline
  startTime: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Extraction des fonctions de rendu pures hors du composant pour 
 * éviter la re-création à chaque cycle de rendu.
 */
const CollagePreview = ({ config, photos }: { config: CollageConfig, photos: PhotoAsset[] }) => {
  const slotCount = config.layout === '2x1' || config.layout === '1x2' ? 2 : 
                   config.layout === '2x2' ? 4 : 3;
  
  const isRow = config.layout === '2x1' || config.layout === '3x1' || config.layout === 'main+2';

  return (
    <View style={[styles.collagePreview, { flexDirection: isRow ? 'row' : 'column' }]}>
      {config.slots.slice(0, slotCount).map((slot, idx) => {
        const photo = photos.find((p) => p.id === slot.photoId);
        return (
          <View
            key={idx}
            style={[
              styles.collageSlot,
              { flex: slot.flex },
              config.layout === '2x2' && idx % 2 === 0 && { borderRightWidth: 1 },
            ]}
          >
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.collageSlotImage} resizeMode="cover" />
            ) : (
              <View style={styles.collageSlotEmpty}>
                <Text style={{ color: '#555', fontSize: 20 }}>📷</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default function EditorScreen() {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(15);
  const [activeTab, setActiveTab] = useState<ActiveTab>('none');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipType, setSelectedClipType] = useState<'video' | 'audio' | 'text' | 'collage' | null>(null);

  const [brightness, setBrightness] = useState<number>(50);
  const [contrast, setContrast] = useState<number>(50);
  const [saturation, setSaturation] = useState<number>(50);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(40);

  const [appliedFilter, setAppliedFilter] = useState<string>('Normal');
  const [appliedEffect, setAppliedEffect] = useState<string>('Aucun');
  const [loading, setLoading] = useState<boolean>(false);

  const [audioLevelLeft, setAudioLevelLeft] = useState<number>(0);
  const [audioLevelRight, setAudioLevelRight] = useState<number>(0);

  // ── États modal audio ────────────────────────────────────────────────────
  const [showAudioModal, setShowAudioModal] = useState<boolean>(false);
  const [audioModalTab, setAudioModalTab] = useState<AudioModalTab>('library');
  const [audioSearchQuery, setAudioSearchQuery] = useState<string>('');
  const [audioGenreFilter, setAudioGenreFilter] = useState<string>('Tous');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [addedTrackIds, setAddedTrackIds] = useState<Set<string>>(new Set());
  const [extractingClipId, setExtractingClipId] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState<number>(0);

  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportPhase, setExportPhase] = useState<string>('');

  const [showGuides, setShowGuides] = useState<boolean>(false);

  // ── Clips existants ──────────────────────────────────────────────────────
  const [videoClips, setVideoClips] = useState<Clip[]>([
    { id: 'v1', name: 'Intro_CapCut.mp4', start: 0, duration: 4, color: '#1E3A8A', keyframes: [1.5] },
    { id: 'v2', name: 'Main_Scene.mp4', start: 4, duration: 7, color: '#2563EB', keyframes: [2, 5] },
    { id: 'v3', name: 'Outro_Credits.mp4', start: 11, duration: 4, color: '#1D4ED8' },
  ]);

  const [audioClips, setAudioClips] = useState<Clip[]>([
    { id: 'a1', name: 'Beat_Stylé.mp3', start: 1, duration: 9, color: '#0F766E', volume: 100, fadeOut: true, audioSource: 'library' },
    { id: 'a2', name: 'Rires_Effect.wav', start: 11, duration: 3, color: '#115E59', volume: 100, audioSource: 'library' },
  ]);

  const [textClips, setTextClips] = useState<TextClip[]>([
    { id: 't1', name: '🔥 BIENVENUE', start: 0.5, duration: 3, color: '#854D0E', fontSize: 22, textColor: '#FFFFFF', positionY: 40 },
    { id: 't2', name: 'EFFETS NEON', start: 5, duration: 4, color: '#A16207', fontSize: 18, textColor: '#00E5FF', positionY: 75 },
  ]);

  // ── Nouveaux états : photos & collages ───────────────────────────────────
  const [importedPhotos, setImportedPhotos] = useState<PhotoAsset[]>([]);
  const [collageClips, setCollageClips] = useState<CollageConfig[]>([]);
  const [showCollageModal, setShowCollageModal] = useState<boolean>(false);
  const [pendingCollagePhotos, setPendingCollagePhotos] = useState<PhotoAsset[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<CollageLayout>('2x1');
  const [showMultiImportModal, setShowMultiImportModal] = useState<boolean>(false);
  const [importedVideoUris, setImportedVideoUris] = useState<{ uri: string; name: string }[]>([]);

  const [addedText, setAddedText] = useState<string>('');

  const scrollRef = useRef<ScrollView>(null);
  const videoPlayerRef = useRef<Video>(null);
  const isScrubbing = useRef<boolean>(false);

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying && !isScrubbing.current) {
      const scrollX = currentTime * pixelsPerSecond;
      scrollRef.current?.scrollTo({ x: scrollX, animated: false });
    }
  }, [currentTime, isPlaying, pixelsPerSecond]);

  useEffect(() => {
    let animFrame: any;
    if (isPlaying) {
      const animateLevels = () => {
        setAudioLevelLeft(Math.random() * 80 + 20);
        setAudioLevelRight(Math.random() * 80 + 20);
        animFrame = setTimeout(animateLevels, 120);
      };
      animateLevels();
    } else {
      setAudioLevelLeft(0);
      setAudioLevelRight(0);
    }
    return () => clearTimeout(animFrame);
  }, [isPlaying]);

  useEffect(() => {
    let interval: any;
    if (isPlaying && !videoUri) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          const nextTime = prev + 0.1 * playbackSpeed;
          if (nextTime >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return nextTime;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, videoUri, duration, playbackSpeed]);

  const startMockExport = () => {
    setExportProgress(0);
    setExportPhase("Initialisation de l'export...");
  };

  useEffect(() => {
    let timer: any;
    if (exportProgress !== null) {
      if (exportProgress < 100) {
        timer = setTimeout(() => {
          const nextVal = exportProgress + 2;
          setExportProgress(nextVal);
          if (nextVal < 30) setExportPhase("Compilation des pistes vidéo...");
          else if (nextVal < 60) setExportPhase("Fusion des bandes audio...");
          else if (nextVal < 85) setExportPhase("Application des filtres de couleur...");
          else setExportPhase("Finalisation du fichier mp4...");
        }, 60);
      } else {
        setExportPhase("Terminé !");
      }
    }
    return () => clearTimeout(timer);
  }, [exportProgress]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCollageSlotCount = (layout: CollageLayout): number => {
    switch (layout) {
      case '2x1': return 2;
      case '1x2': return 2;
      case '2x2': return 4;
      case '3x1': return 3;
      case 'main+2': return 3;
    }
  };

  const getLayoutLabel = (layout: CollageLayout): string => {
    switch (layout) {
      case '2x1': return '◫◫ Côte à côte';
      case '1x2': return '⬒ Haut/Bas';
      case '2x2': return '⊞ Grille 4';
      case '3x1': return '|||  Trio';
      case 'main+2': return '▣ Principal+2';
    }
  };

  // ── Bibliothèque musicale ────────────────────────────────────────────────
  const MUSIC_LIBRARY = [
    { id: 'ml1',  name: 'Beat Urban',      artist: 'CapCut Sounds', genre: 'Hip-Hop',    duration: 32, bpm: 140 },
    { id: 'ml2',  name: 'Lofi Chill',      artist: 'CapCut Sounds', genre: 'Lofi',       duration: 45, bpm: 85  },
    { id: 'ml3',  name: 'Epic Cinematic',  artist: 'FilmScore',     genre: 'Cinéma',     duration: 60, bpm: 120 },
    { id: 'ml4',  name: 'Retro Groove',    artist: 'Vintage Beats', genre: 'Hip-Hop',    duration: 38, bpm: 105 },
    { id: 'ml5',  name: 'Tropical Vibes',  artist: 'Summer Studio', genre: 'Pop',        duration: 28, bpm: 118 },
    { id: 'ml6',  name: 'Dark Trap',       artist: 'Night Prod.',   genre: 'Hip-Hop',    duration: 36, bpm: 160 },
    { id: 'ml7',  name: 'Acoustic Guitar', artist: 'Folk Tunes',    genre: 'Acoustique', duration: 50, bpm: 95  },
    { id: 'ml8',  name: 'Electro Dance',   artist: 'EDM Masters',   genre: 'EDM',        duration: 42, bpm: 128 },
    { id: 'ml9',  name: 'Jazz Night',      artist: 'Blue Note',     genre: 'Lofi',       duration: 55, bpm: 100 },
    { id: 'ml10', name: 'Motivational',    artist: 'Power Tracks',  genre: 'Pop',        duration: 40, bpm: 130 },
    { id: 'ml11', name: 'Romantic Piano',  artist: 'Soft Keys',     genre: 'Classique',  duration: 48, bpm: 75  },
    { id: 'ml12', name: 'Street Vlog',     artist: 'Urban Films',   genre: 'Vlog',       duration: 30, bpm: 110 },
  ];

  const SFX_LIBRARY = [
    { id: 'sfx1', name: 'Applaudissements', duration: 3 },
    { id: 'sfx2', name: 'Rires',            duration: 4 },
    { id: 'sfx3', name: 'Swoosh',           duration: 1 },
    { id: 'sfx4', name: 'Explosion',        duration: 2 },
    { id: 'sfx5', name: 'Cloche',           duration: 2 },
    { id: 'sfx6', name: 'Notification',     duration: 1 },
    { id: 'sfx7', name: 'Vent',             duration: 4 },
    { id: 'sfx8', name: 'Applause',         duration: 3 },
  ];

  const AUDIO_GENRES = ['Tous', 'Hip-Hop', 'Lofi', 'Pop', 'Cinéma', 'EDM', 'Acoustique', 'Classique', 'Vlog'];

  // ── Ajouter depuis la bibliothèque ───────────────────────────────────────
  const handleAddFromLibrary = (track: typeof MUSIC_LIBRARY[0]) => {
    if (addedTrackIds.has(track.id)) return;
    setDownloadingId(track.id);
    setTimeout(() => {
      const clip: Clip = {
        id: 'a_lib_' + Date.now(),
        name: track.name,
        start: currentTime,
        duration: track.duration,
        color: '#0F766E',
        volume: 100,
        fadeIn: false,
        fadeOut: true,
        audioSource: 'library',
      };
      setAudioClips(prev => [...prev, clip]);
      setSelectedClipId(clip.id);
      setSelectedClipType('audio');
      setAddedTrackIds(prev => new Set([...prev, track.id]));
      setDownloadingId(null);
      Alert.alert('🎵 Ajouté', `"${track.name}" placé à ${currentTime.toFixed(1)}s.`);
    }, 1200);
  };

  // ── Ajouter SFX ──────────────────────────────────────────────────────────
  const handleAddSfx = (sfx: typeof SFX_LIBRARY[0]) => {
    const clip: Clip = {
      id: 'a_sfx_' + Date.now(),
      name: '🔊 ' + sfx.name,
      start: currentTime,
      duration: sfx.duration,
      color: '#115E59',
      volume: 100,
      audioSource: 'library',
    };
    setAudioClips(prev => [...prev, clip]);
    setSelectedClipId(clip.id);
    setSelectedClipType('audio');
    setShowAudioModal(false);
    Alert.alert('✅', `Son "${sfx.name}" ajouté.`);
  };

  // ── Importer fichier audio depuis galerie ────────────────────────────────
  const handleImportAudioFile = async () => {
    setLoading(true);
    try {
      const result = await launchImageLibrary({ mediaType: 'mixed', quality: 1, selectionLimit: 5 });
      if (!result.assets?.length) return;
      let start = currentTime;
      const newClips: Clip[] = result.assets.map((a, i) => {
        const clip: Clip = {
          id: 'a_imp_' + Date.now() + '_' + i,
          name: a.fileName || `Audio_${i + 1}`,
          start,
          duration: a.duration ?? 10,
          color: '#1E40AF',
          volume: 100,
          fadeIn: false,
          fadeOut: false,
          audioSource: 'import',
          uri: a.uri,
        };
        start += clip.duration;
        return clip;
      });
      setAudioClips(prev => [...prev, ...newClips]);
      setSelectedClipId(newClips[0].id);
      setSelectedClipType('audio');
      setShowAudioModal(false);
      Alert.alert('✅ Importé', `${newClips.length} fichier(s) audio ajouté(s) à la timeline.`);
    } catch {
      Alert.alert('Erreur', "Impossible d'importer.");
    } finally {
      setLoading(false);
    }
  };

  // ── Extraire son d'un clip vidéo ─────────────────────────────────────────
  const handleExtractAudio = (videoClip: Clip) => {
    setExtractingClipId(videoClip.id);
    setExtractProgress(0);
    const interval = setInterval(() => {
      setExtractProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          const extracted: Clip = {
            id: 'a_ext_' + Date.now(),
            name: '🎵 Son de ' + videoClip.name,
            start: videoClip.start,
            duration: videoClip.duration,
            color: '#7C3AED',
            volume: 100,
            fadeIn: false,
            fadeOut: false,
            audioSource: 'extracted',
          };
          setAudioClips(p => [...p, extracted]);
          setSelectedClipId(extracted.id);
          setSelectedClipType('audio');
          setExtractingClipId(null);
          setExtractProgress(0);
          Alert.alert('✅ Son extrait !', `"${videoClip.name}" → piste audio séparée créée.`);
          return 0;
        }
        return prev + 10;
      });
    }, 150);
  };

  // ── Volume / Mute / Fade ─────────────────────────────────────────────────
  const handleSetAudioVolume = (delta: number) => {
    if (!selectedClipId) return;
    const upd = (c: Clip) => c.id === selectedClipId
      ? { ...c, volume: Math.max(0, Math.min(200, (c.volume ?? 100) + delta)) } : c;
    if (selectedClipType === 'audio') setAudioClips(p => p.map(upd));
    else if (selectedClipType === 'video') setVideoClips(p => p.map(upd));
  };

  const handleToggleMute = () => {
    if (!selectedClipId) return;
    const upd = (c: Clip) => c.id === selectedClipId ? { ...c, muted: !c.muted } : c;
    if (selectedClipType === 'audio') setAudioClips(p => p.map(upd));
    else if (selectedClipType === 'video') setVideoClips(p => p.map(upd));
  };

  const handleToggleFade = (type: 'fadeIn' | 'fadeOut') => {
    if (!selectedClipId || selectedClipType !== 'audio') return;
    setAudioClips(p => p.map(c =>
      c.id === selectedClipId ? { ...c, [type]: !c[type] } : c
    ));
  };

  // ── Filtrer la bibliothèque ──────────────────────────────────────────────
  const filteredTracks = MUSIC_LIBRARY.filter(t => {
    const genreOk = audioGenreFilter === 'Tous' || t.genre === audioGenreFilter;
    const searchOk = !audioSearchQuery || t.name.toLowerCase().includes(audioSearchQuery.toLowerCase()) || t.artist.toLowerCase().includes(audioSearchQuery.toLowerCase());
    return genreOk && searchOk;
  });

  // ── Import vidéo UNIQUE (existant) ───────────────────────────────────────
  const handleSelectVideo = async () => {
    setLoading(true);
    try {
      const result = await launchImageLibrary({ mediaType: 'video', quality: 1 });
      if (result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri || null;
        setVideoUri(uri);

        const newClip: Clip = {
          id: 'v_real_' + Date.now(),
          name: result.assets[0].fileName || 'Video_Importee.mp4',
          start: currentTime,
          duration: 12,
          color: '#D500F9',
        };

        setVideoClips((prev) => [...prev, newClip].sort((a, b) => a.start - b.start));
        setSelectedClipId(newClip.id);
        setSelectedClipType('video');
        Alert.alert("Succès", "Vidéo importée et placée sur la timeline !");
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'importer la vidéo.");
    } finally {
      setLoading(false);
    }
  };

  // ── Import MULTIPLE vidéos ────────────────────────────────────────────────
  const handleSelectMultipleVideos = async () => {
    setLoading(true);
    try {
      // React Native Image Picker ne supporte pas nativement la sélection multiple
      // On simule via des appels successifs ou on utilise selectionLimit si dispo
      const result = await launchImageLibrary({
        mediaType: 'video',
        quality: 1,
        selectionLimit: 10, // disponible depuis react-native-image-picker v4+
      });

      if (result.assets && result.assets.length > 0) {
        const newVideos = result.assets.map((asset, idx) => ({
          uri: asset.uri || '',
          name: asset.fileName || `Vidéo_${idx + 1}.mp4`,
        }));

        setImportedVideoUris(newVideos);

        // Placer chaque vidéo à la suite sur la timeline
        let currentStart = currentTime;
        const newClips: Clip[] = newVideos.map((v, idx) => {
          const clip: Clip = {
            id: 'v_multi_' + Date.now() + '_' + idx,
            name: v.name,
            start: currentStart,
            duration: 8,
            color: `hsl(${210 + idx * 25}, 80%, 45%)`,
          };
          currentStart += 8;
          return clip;
        });

        setVideoClips((prev) => [...prev, ...newClips].sort((a, b) => a.start - b.start));

        // Définir la première comme vidéo active
        if (newVideos[0]?.uri) setVideoUri(newVideos[0].uri);
        if (newClips.length > 0) {
          setSelectedClipId(newClips[0].id);
          setSelectedClipType('video');
        }

        setShowMultiImportModal(true);
        Alert.alert("Succès", `${newVideos.length} vidéo(s) importée(s) et placée(s) sur la timeline !`);
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'importer les vidéos.");
    } finally {
      setLoading(false);
    }
  };

  // ── Import photos ─────────────────────────────────────────────────────────
  const handleImportPhotos = async () => {
    setLoading(true);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 1,
        selectionLimit: 10,
      });

      if (result.assets && result.assets.length > 0) {
        const newPhotos: PhotoAsset[] = result.assets.map((asset, idx) => ({
          id: 'photo_' + Date.now() + '_' + idx,
          uri: asset.uri || '',
          name: asset.fileName || `Photo_${idx + 1}.jpg`,
        }));

        setImportedPhotos((prev) => [...prev, ...newPhotos]);
        Alert.alert(
          "Photos importées",
          `${newPhotos.length} photo(s) ajoutée(s). Allez dans l'onglet Collage pour les arranger !`
        );
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'importer les photos.");
    } finally {
      setLoading(false);
    }
  };

  // ── Créer un collage ──────────────────────────────────────────────────────
  const handleOpenCollageBuilder = () => {
    if (importedPhotos.length < 2) {
      Alert.alert(
        "Photos insuffisantes",
        "Importez au moins 2 photos pour créer un collage (onglet → Importer → Photos)."
      );
      return;
    }
    setPendingCollagePhotos(importedPhotos.slice(0, getCollageSlotCount(selectedLayout)));
    setShowCollageModal(true);
  };

  const handleConfirmCollage = () => {
    const slotCount = getCollageSlotCount(selectedLayout);
    const slots: CollageSlot[] = Array.from({ length: slotCount }, (_, i) => ({
      photoId: pendingCollagePhotos[i]?.id || null,
      flex: selectedLayout === 'main+2' && i === 0 ? 2 : 1,
    }));

    const newCollage: CollageConfig = {
      layout: selectedLayout,
      slots,
      duration: 5,
      startTime: currentTime,
    };

    setCollageClips((prev) => [...prev, newCollage]);
    setShowCollageModal(false);
    Alert.alert("Collage créé !", `Collage "${getLayoutLabel(selectedLayout)}" placé sur la timeline à ${currentTime.toFixed(1)}s.`);
  };

  // ── Rendu prévisualisation collage actif ──────────────────────────────────
  const activeCollage = collageClips.find(
    (c) => currentTime >= c.startTime && currentTime <= c.startTime + c.duration
  );

  // ── Autres handlers (inchangés) ───────────────────────────────────────────
  const handleSignOut = async () => { await supabase.auth.signOut(); };

  const handleSplit = () => {
    if (selectedClipType !== 'video' || !selectedClipId) {
      Alert.alert("Action Requise", "Sélectionnez un clip vidéo pour le diviser.");
      return;
    }
    const clipIndex = videoClips.findIndex((c) => c.id === selectedClipId);
    if (clipIndex === -1) return;
    const clip = videoClips[clipIndex];
    if (currentTime <= clip.start || currentTime >= clip.start + clip.duration) {
      Alert.alert("Division Impossible", "Le curseur doit être au MILIEU du clip.");
      return;
    }
    const firstClip: Clip = { ...clip, id: clip.id + '_part1', duration: currentTime - clip.start };
    const secondClip: Clip = { ...clip, id: clip.id + '_part2', start: currentTime, duration: clip.start + clip.duration - currentTime, name: clip.name + ' (Suite)' };
    setVideoClips((prev) => { const copy = [...prev]; copy.splice(clipIndex, 1, firstClip, secondClip); return copy; });
    setSelectedClipId(secondClip.id);
    Alert.alert("Succès", `Clip divisé à ${currentTime.toFixed(1)}s.`);
  };

  const handleDeleteSelected = () => {
    if (!selectedClipId || !selectedClipType) { Alert.alert("Action Requise", "Sélectionnez un clip à supprimer."); return; }
    if (selectedClipType === 'video') setVideoClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    else if (selectedClipType === 'audio') setAudioClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    else if (selectedClipType === 'text') setTextClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    else if (selectedClipType === 'collage') setCollageClips((prev) => prev.filter((c) => c.startTime.toString() !== selectedClipId));
    setSelectedClipId(null); setSelectedClipType(null);
  };

  const handleAddText = () => {
    const textVal = addedText.trim();
    if (!textVal) { Alert.alert("Erreur", "Saisissez d'abord un texte."); return; }
    const newTextClip: TextClip = { id: 't_' + Date.now(), name: textVal, start: currentTime, duration: 4, color: '#A16207', fontSize: 18, textColor: '#FFFFFF', positionY: 70 };
    setTextClips((prev) => [...prev, newTextClip]);
    setSelectedClipId(newTextClip.id); setSelectedClipType('text'); setAddedText('');
    Alert.alert("Succès", "Texte inséré sur la timeline !");
  };

  const handleShiftClip = (amount: number) => {
    if (!selectedClipId || !selectedClipType) return;
    
    const updateStart = (prev: Clip[]) => prev.map((c) => 
      c.id === selectedClipId ? { ...c, start: Math.max(0, c.start + amount) } : c
    );

    if (selectedClipType === 'video') setVideoClips(updateStart);
    else if (selectedClipType === 'audio') setAudioClips(updateStart);
    else if (selectedClipType === 'text') setTextClips(updateStart as any);
  };

  const handleResizeClip = (amount: number) => {
    if (!selectedClipId || !selectedClipType) return;

    const updateDuration = (prev: Clip[]) => prev.map((c) => 
      c.id === selectedClipId ? { ...c, duration: Math.max(0.5, c.duration + amount) } : c
    );

    if (selectedClipType === 'video') setVideoClips(updateDuration);
    else if (selectedClipType === 'audio') setAudioClips(updateDuration);
    else if (selectedClipType === 'text') setTextClips(updateDuration as any);
  };

  const handleAddKeyframe = () => {
    if (selectedClipType !== 'video' || !selectedClipId) { Alert.alert("Action Requise", "Sélectionnez un clip vidéo."); return; }
    const clip = videoClips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    if (currentTime < clip.start || currentTime > clip.start + clip.duration) { Alert.alert("Hors cadre", "Le curseur doit être sur le clip."); return; }
    const relativeTime = currentTime - clip.start;
    setVideoClips((prev) => prev.map((c) => {
      if (c.id === selectedClipId) {
        const keys = c.keyframes ? [...c.keyframes] : [];
        if (!keys.includes(relativeTime)) keys.push(relativeTime);
        return { ...c, keyframes: keys.sort((a, b) => a - b) };
      }
      return c;
    }));
    Alert.alert("Image clé", `Image clé ajoutée à ${relativeTime.toFixed(1)}s.`);
  };

  const handleScrollTimeline = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isScrubbing.current) {
      const scrollX = event.nativeEvent.contentOffset.x;
      const newTime = Math.max(0, scrollX / pixelsPerSecond);
      setCurrentTime(newTime);
      if (videoUri && videoPlayerRef.current) videoPlayerRef.current.seek(newTime);
    }
  };

  const activeTexts = textClips.filter((t) => currentTime >= t.start && currentTime <= t.start + t.duration);

  const activeSelectedClip =
    selectedClipType === 'video' ? videoClips.find((c) => c.id === selectedClipId) :
    selectedClipType === 'audio' ? audioClips.find((c) => c.id === selectedClipId) :
    selectedClipType === 'text' ? textClips.find((c) => c.id === selectedClipId) : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* 1. Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleSignOut}>
          <Text style={styles.headerBtnText}>🚪 Déconnexion</Text>
        </TouchableOpacity>
        <View style={styles.resolutionContainer}>
          <Text style={styles.resolutionText}>1080P • {playbackSpeed === 1 ? '30' : playbackSpeed === 2 ? '60' : '15'} FPS  ▼</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={startMockExport}>
          <Text style={styles.exportBtnText}>EXPORTER</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Preview */}
      <View style={styles.previewContainer}>
        <View style={styles.audioMeterWrapper}>
          <View style={[styles.audioMeterBar, { height: `${audioLevelLeft}%`, backgroundColor: audioLevelLeft > 80 ? '#EF4444' : audioLevelLeft > 60 ? '#FBBF24' : '#10B981' }]} />
        </View>

        <View style={[
          styles.previewWrapper,
          { width: aspectRatio === '9:16' ? 140 : aspectRatio === '1:1' ? 220 : screenWidth - 60, height: aspectRatio === '9:16' ? 248 : 220 }
        ]}>
          {loading ? (
            <ActivityIndicator size="large" color="#00E5FF" />
          ) : activeCollage ? (
            // ── Affichage collage actif ──
            <CollagePreview config={activeCollage} photos={importedPhotos} />
          ) : videoUri ? (
            <Video
              ref={videoPlayerRef}
              source={{ uri: videoUri }}
              style={styles.video}
              paused={!isPlaying}
              onProgress={(data) => { if (!isScrubbing.current) setCurrentTime(data.currentTime); }}
              onLoad={(data) => setDuration(data.duration)}
              resizeMode="contain"
              repeat={true}
            />
          ) : (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderEmoji}>🎬</Text>
              <Text style={styles.placeholderText}>Zone de prévisualisation</Text>
              {/* Boutons d'import groupés */}
              <View style={styles.importButtonsRow}>
                <TouchableOpacity style={styles.importBtn} onPress={handleSelectVideo}>
                  <Text style={styles.importBtnText}>🎥 Vidéo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.importBtn, { backgroundColor: '#7C3AED' }]} onPress={handleSelectMultipleVideos}>
                  <Text style={styles.importBtnText}>🎞️ Multi</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.importBtn, { backgroundColor: '#059669' }]} onPress={handleImportPhotos}>
                  <Text style={styles.importBtnText}>🖼️ Photos</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.guideLinesToggle} onPress={() => setShowGuides(!showGuides)}>
            <Text style={{ color: showGuides ? '#00E5FF' : '#666', fontSize: 10, fontWeight: 'bold' }}>🌐 Repères</Text>
          </TouchableOpacity>

          {showGuides && (
            <View style={styles.guidesOverlay} pointerEvents="none">
              <View style={styles.horizontalGuideLine} />
              <View style={styles.verticalGuideLine} />
            </View>
          )}

          {brightness !== 50 && (
            <View style={[styles.brightnessOverlay, { backgroundColor: brightness > 50 ? 'white' : 'black', opacity: brightness > 50 ? (brightness - 50) / 100 : (50 - brightness) / 100 }]} pointerEvents="none" />
          )}

          {appliedFilter !== 'Normal' && (
            <View style={[styles.filterOverlay, { backgroundColor: appliedFilter === 'Cinéma' ? 'rgba(213,0,249,0.15)' : appliedFilter === 'Naturel' ? 'rgba(0,229,255,0.1)' : appliedFilter === 'Noir & Blanc' ? 'rgba(0,0,0,0.45)' : 'transparent' }]} pointerEvents="none" />
          )}

          {appliedEffect !== 'Aucun' && (
            <View style={[styles.effectBorder, { borderColor: appliedEffect === 'Secouer' ? '#D500F9' : '#00E5FF', borderWidth: appliedEffect === 'Flou Neon' ? 4 : 2 }]} pointerEvents="none" />
          )}

          {activeTexts.map((textClip) => (
            <View key={textClip.id} style={[styles.previewTextContainer, { top: `${textClip.positionY}%` }, selectedClipId === textClip.id && styles.selectedPreviewText]} pointerEvents="none">
              <Text style={[styles.previewText, { fontSize: textClip.fontSize, color: textClip.textColor }]}>{textClip.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.audioMeterWrapper}>
          <View style={[styles.audioMeterBar, { height: `${audioLevelRight}%`, backgroundColor: audioLevelRight > 80 ? '#EF4444' : audioLevelRight > 60 ? '#FBBF24' : '#10B981' }]} />
        </View>
      </View>

      {/* 3. Controls */}
      <View style={styles.controlsRow}>
        <View style={styles.timeCounter}>
          <Text style={styles.timeTextActive}>{formatTime(currentTime)}</Text>
          <Text style={styles.timeTextDivider}> / </Text>
          <Text style={styles.timeTextDuration}>{formatTime(duration)}</Text>
        </View>
        <View style={styles.quickPlayControls}>
          <TouchableOpacity style={styles.controlIcon} onPress={() => { setCurrentTime(0); scrollRef.current?.scrollTo({ x: 0, animated: true }); if (videoPlayerRef.current) videoPlayerRef.current.seek(0); }}>
            <Text style={styles.emojiIcon}>⏮️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.controlIcon, styles.playPauseBtn]} onPress={() => setIsPlaying(!isPlaying)}>
            <Text style={styles.playPauseEmoji}>{isPlaying ? '⏸️' : '▶️'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlIcon} onPress={() => { setDuration((prev) => prev + 5); Alert.alert("Durée", "Timeline étendue de 5s."); }}>
            <Text style={styles.emojiIcon}>⏳</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickHistory}>
          <TouchableOpacity style={[styles.controlIcon, !selectedClipId && { opacity: 0.4 }]} onPress={handleDeleteSelected} disabled={!selectedClipId}>
            <Text style={styles.emojiIcon}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. Timeline */}
      <View style={styles.timelineContainer}>
        <View style={styles.zoomControlsContainer}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => setPixelsPerSecond((prev) => Math.max(20, prev - 10))}>
            <Text style={styles.zoomBtnText}>🔍-</Text>
          </TouchableOpacity>
          <View style={styles.zoomTextContainer}>
            <Text style={styles.zoomText}>{pixelsPerSecond} px/s</Text>
          </View>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => setPixelsPerSecond((prev) => Math.min(80, prev + 10))}>
            <Text style={styles.zoomBtnText}>🔍+</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.timelineScrollContent}
          ref={scrollRef}
          onScroll={handleScrollTimeline}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => { isScrubbing.current = true; }}
          onScrollEndDrag={() => { isScrubbing.current = false; }}
          onMomentumScrollBegin={() => { isScrubbing.current = true; }}
          onMomentumScrollEnd={() => { isScrubbing.current = false; }}
        >
          <View style={styles.tracksWrapper}>
            {/* Ruler */}
            <View style={styles.rulerRow}>
              {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                <View key={i} style={[styles.rulerTick, { width: pixelsPerSecond }]}>
                  <Text style={styles.rulerTickText}>{i}s</Text>
                  <View style={styles.rulerLine} />
                  <View style={[styles.rulerLineSub, { left: pixelsPerSecond / 2 }]} />
                </View>
              ))}
            </View>

            {/* Piste Vidéo */}
            <View style={styles.trackRow}>
              <Text style={styles.trackLabel}>🎥 Vidéo</Text>
              <View style={styles.trackLane}>
                {videoClips.map((clip) => {
                  const isSelected = selectedClipId === clip.id && selectedClipType === 'video';
                  return (
                    <TouchableOpacity key={clip.id} style={[styles.clipBlock, { left: clip.start * pixelsPerSecond, width: clip.duration * pixelsPerSecond, backgroundColor: clip.color }, isSelected && styles.selectedClipBlock]}
                      onPress={() => { setSelectedClipId(clip.id); setSelectedClipType('video'); }}>
                      <View style={styles.clipBlockHeader}>
                        <Text style={styles.clipBlockText} numberOfLines={1}>{clip.name}</Text>
                      </View>
                      {clip.keyframes && clip.keyframes.map((kf, kfIdx) => (
                        <View key={kfIdx} style={[styles.keyframeDiamond, { left: kf * pixelsPerSecond }]} pointerEvents="none" />
                      ))}
                      <Text style={styles.clipDurationSubtext}>{clip.duration.toFixed(1)}s</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Piste Audio */}
            <View style={styles.trackRow}>
              <Text style={styles.trackLabel}>🎵 Audio</Text>
              <View style={styles.trackLane}>
                {audioClips.map((clip) => {
                  const isSelected = selectedClipId === clip.id && selectedClipType === 'audio';
                  return (
                    <TouchableOpacity key={clip.id} style={[styles.clipBlock, { left: clip.start * pixelsPerSecond, width: clip.duration * pixelsPerSecond, backgroundColor: clip.color }, isSelected && styles.selectedClipBlock]}
                      onPress={() => { setSelectedClipId(clip.id); setSelectedClipType('audio'); }}>
                      <View style={styles.waveformContainer}>
                        {Array.from({ length: Math.max(5, Math.floor(clip.duration * 4)) }).map((_, idx) => (
                          <View key={idx} style={[styles.waveBar, { height: 4 + (idx % 3 === 0 ? 14 : idx % 2 === 0 ? 9 : 5) }]} />
                        ))}
                      </View>
                      <Text style={styles.audioClipText} numberOfLines={1}>{clip.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Piste Texte */}
            <View style={styles.trackRow}>
              <Text style={styles.trackLabel}>📝 Texte</Text>
              <View style={styles.trackLane}>
                {textClips.map((clip) => {
                  const isSelected = selectedClipId === clip.id && selectedClipType === 'text';
                  return (
                    <TouchableOpacity key={clip.id} style={[styles.clipBlock, { left: clip.start * pixelsPerSecond, width: clip.duration * pixelsPerSecond, backgroundColor: clip.color }, isSelected && styles.selectedClipBlock]}
                      onPress={() => { setSelectedClipId(clip.id); setSelectedClipType('text'); }}>
                      <Text style={styles.clipBlockText} numberOfLines={1}>💬 {clip.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── NOUVELLE PISTE COLLAGE ────────────────────────────────── */}
            <View style={styles.trackRow}>
              <Text style={styles.trackLabel}>🖼️ Collage</Text>
              <View style={styles.trackLane}>
                {collageClips.map((collage, idx) => {
                  const clipId = 'collage_' + collage.startTime;
                  const isSelected = selectedClipId === clipId && selectedClipType === 'collage';
                  return (
                    <TouchableOpacity key={idx}
                      style={[styles.clipBlock, styles.collageClipBlock, { left: collage.startTime * pixelsPerSecond, width: collage.duration * pixelsPerSecond }, isSelected && styles.selectedClipBlock]}
                      onPress={() => { setSelectedClipId(clipId); setSelectedClipType('collage'); }}>
                      <Text style={styles.clipBlockText} numberOfLines={1}>
                        🖼️ {getLayoutLabel(collage.layout)}
                      </Text>
                      <Text style={styles.clipDurationSubtext}>{collage.duration.toFixed(1)}s</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.playhead} pointerEvents="none" />
      </View>

      {/* 5. Submenus */}
      {activeTab !== 'none' && (
        <View style={styles.submenuContainer}>
          <View style={styles.submenuHeader}>
            <Text style={styles.submenuTitle}>{activeTab.toUpperCase()}</Text>
            <TouchableOpacity onPress={() => setActiveTab('none')}>
              <Text style={styles.closeSubmenuBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.submenuScroll}>

            {activeTab === 'modifier' && (
              <View style={styles.submenuContent}>
                <TouchableOpacity style={styles.submenuItem} onPress={handleSplit}>
                  <Text style={styles.submenuEmoji}>✂️</Text>
                  <Text style={styles.submenuText}>Diviser</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submenuItem, playbackSpeed === 2 && styles.activeSubmenuOption]}
                  onPress={() => { const nextSpeed = playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 0.5 : 1; setPlaybackSpeed(nextSpeed); Alert.alert("Vitesse", `${nextSpeed}x`); }}>
                  <Text style={styles.submenuEmoji}>⏱️</Text>
                  <Text style={styles.submenuText}>Vitesse ({playbackSpeed}x)</Text>
                </TouchableOpacity>
                {selectedClipType === 'video' && (
                  <TouchableOpacity style={styles.submenuItem} onPress={handleAddKeyframe}>
                    <Text style={styles.submenuEmoji}>♦️</Text>
                    <Text style={styles.submenuText}>Image clé</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.submenuItem} onPress={handleDeleteSelected}>
                  <Text style={styles.submenuEmoji}>🗑️</Text>
                  <Text style={styles.submenuText}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === 'audio' && (
              <View style={styles.submenuContent}>
                {/* Bibliothèque */}
                <TouchableOpacity style={[styles.submenuItem, { backgroundColor: '#064E3B', borderColor: '#10B981' }]}
                  onPress={() => { setAudioModalTab('library'); setShowAudioModal(true); }}>
                  <Text style={styles.submenuEmoji}>🎵</Text>
                  <Text style={[styles.submenuText, { color: '#10B981' }]}>Bibliothèque</Text>
                </TouchableOpacity>
                {/* Importer fichier */}
                <TouchableOpacity style={[styles.submenuItem, { backgroundColor: '#1E3A8A', borderColor: '#3B82F6' }]}
                  onPress={() => { setAudioModalTab('import'); setShowAudioModal(true); }}>
                  <Text style={styles.submenuEmoji}>📂</Text>
                  <Text style={[styles.submenuText, { color: '#93C5FD' }]}>Importer</Text>
                </TouchableOpacity>
                {/* Extraire son */}
                <TouchableOpacity style={[styles.submenuItem, { backgroundColor: '#4C1D95', borderColor: '#8B5CF6' }]}
                  onPress={() => { setAudioModalTab('extract'); setShowAudioModal(true); }}>
                  <Text style={styles.submenuEmoji}>🎬</Text>
                  <Text style={[styles.submenuText, { color: '#C4B5FD' }]}>Extraire son</Text>
                </TouchableOpacity>
                {/* Réglages clip sélectionné */}
                {selectedClipType === 'audio' && selectedClipId && (() => {
                  const clip = audioClips.find(c => c.id === selectedClipId);
                  if (!clip) return null;
                  return (
                    <>
                      <View style={[styles.submenuItem, { width: 100 }]}>
                        <Text style={styles.submenuEmoji}>🔊</Text>
                        <Text style={styles.submenuText}>Vol: {clip.volume ?? 100}%</Text>
                        <View style={{ flexDirection: 'row', marginTop: 3 }}>
                          <TouchableOpacity style={styles.miniVolBtn} onPress={() => handleSetAudioVolume(-10)}>
                            <Text style={styles.miniVolBtnText}>−</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.miniVolBtn, { marginLeft: 4 }]} onPress={() => handleSetAudioVolume(10)}>
                            <Text style={styles.miniVolBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <TouchableOpacity style={[styles.submenuItem, clip.muted && { borderColor: '#EF4444', backgroundColor: '#450A0A' }]}
                        onPress={handleToggleMute}>
                        <Text style={styles.submenuEmoji}>{clip.muted ? '🔇' : '🔈'}</Text>
                        <Text style={styles.submenuText}>{clip.muted ? 'Muet ON' : 'Muet'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.submenuItem, clip.fadeIn && styles.activeSubmenuOption]}
                        onPress={() => handleToggleFade('fadeIn')}>
                        <Text style={styles.submenuEmoji}>📈</Text>
                        <Text style={styles.submenuText}>Fondu entrant</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.submenuItem, clip.fadeOut && styles.activeSubmenuOption]}
                        onPress={() => handleToggleFade('fadeOut')}>
                        <Text style={styles.submenuEmoji}>📉</Text>
                        <Text style={styles.submenuText}>Fondu sortant</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </View>
            )}

            {activeTab === 'texte' && (
              <View style={styles.submenuContentInputs}>
                <TextInput placeholder="Tapez le texte à ajouter..." placeholderTextColor="#666" style={styles.textInput} onChangeText={setAddedText} value={addedText} />
                <TouchableOpacity style={styles.addTextBtn} onPress={handleAddText}>
                  <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === 'effets' && (
              <View style={styles.submenuContent}>
                {['Aucun', 'Secouer', 'Flou Neon', 'Zoom'].map((eff) => (
                  <TouchableOpacity key={eff} style={[styles.submenuItem, appliedEffect === eff && styles.activeSubmenuOption]} onPress={() => setAppliedEffect(eff)}>
                    <Text style={styles.submenuEmoji}>🪄</Text><Text style={styles.submenuText}>{eff}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {activeTab === 'filtres' && (
              <View style={styles.submenuContent}>
                {['Normal', 'Cinéma', 'Naturel', 'Noir & Blanc'].map((filt) => (
                  <TouchableOpacity key={filt} style={[styles.submenuItem, appliedFilter === filt && styles.activeSubmenuOption]} onPress={() => setAppliedFilter(filt)}>
                    <Text style={styles.submenuEmoji}>🎨</Text><Text style={styles.submenuText}>{filt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {activeTab === 'ajuster' && (
              <View style={styles.submenuContentAjuster}>
                {[{ label: 'Luminosité', value: brightness, set: setBrightness }, { label: 'Contraste', value: contrast, set: setContrast }, { label: 'Saturation', value: saturation, set: setSaturation }].map(({ label, value, set }) => (
                  <View key={label} style={styles.sliderItem}>
                    <Text style={styles.sliderLabel}>{label} ({value})</Text>
                    <View style={styles.sliderButtonsRow}>
                      <TouchableOpacity style={styles.sliderBtn} onPress={() => set(Math.max(0, value - 10))}>
                        <Text style={styles.sliderBtnText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.sliderBtn} onPress={() => set(Math.min(100, value + 10))}>
                        <Text style={styles.sliderBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'format' && (
              <View style={styles.submenuContent}>
                {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((aspect) => (
                  <TouchableOpacity key={aspect} style={[styles.submenuItem, aspectRatio === aspect && styles.activeSubmenuOption]} onPress={() => setAspectRatio(aspect)}>
                    <Text style={styles.submenuEmoji}>📱</Text><Text style={styles.submenuText}>{aspect}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── NOUVEAU : onglet Collage ───────────────────────────────── */}
            {activeTab === 'collage' && (
              <View style={styles.submenuContent}>
                {/* Importer vidéos multiples */}
                <TouchableOpacity style={styles.submenuItem} onPress={handleSelectMultipleVideos}>
                  <Text style={styles.submenuEmoji}>🎞️</Text>
                  <Text style={styles.submenuText}>Multi vidéos</Text>
                </TouchableOpacity>

                {/* Importer photos */}
                <TouchableOpacity style={styles.submenuItem} onPress={handleImportPhotos}>
                  <Text style={styles.submenuEmoji}>🖼️</Text>
                  <Text style={styles.submenuText}>Photos ({importedPhotos.length})</Text>
                </TouchableOpacity>

                {/* Layouts */}
                {(['2x1', '1x2', '2x2', '3x1', 'main+2'] as CollageLayout[]).map((layout) => (
                  <TouchableOpacity key={layout} style={[styles.submenuItem, selectedLayout === layout && styles.activeSubmenuOption]}
                    onPress={() => setSelectedLayout(layout)}>
                    <Text style={styles.submenuEmoji}>🗂️</Text>
                    <Text style={styles.submenuText}>{getLayoutLabel(layout)}</Text>
                  </TouchableOpacity>
                ))}

                {/* Créer collage */}
                <TouchableOpacity style={[styles.submenuItem, { backgroundColor: '#7C3AED', borderColor: '#A78BFA' }]} onPress={handleOpenCollageBuilder}>
                  <Text style={styles.submenuEmoji}>✨</Text>
                  <Text style={[styles.submenuText, { color: '#fff' }]}>Créer</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* Trim Panel */}
      {selectedClipId && activeSelectedClip && (
        <View style={styles.trimPanelContainer}>
          <Text style={styles.trimPanelTitle}>AJUSTEMENT : "{activeSelectedClip.name.substring(0, 15)}" ({selectedClipType?.toUpperCase()})</Text>
          <View style={styles.trimPanelRow}>
            <View style={styles.trimPanelAction}>
              <Text style={styles.trimLabel}>Position (Début: {activeSelectedClip.start.toFixed(1)}s)</Text>
              <View style={styles.sliderButtonsRow}>
                <TouchableOpacity style={styles.trimBtn} onPress={() => handleShiftClip(-0.5)}><Text style={styles.trimBtnText}>◀ -0.5s</Text></TouchableOpacity>
                <TouchableOpacity style={styles.trimBtn} onPress={() => handleShiftClip(0.5)}><Text style={styles.trimBtnText}>+0.5s ▶</Text></TouchableOpacity>
              </View>
            </View>
            <View style={styles.trimPanelAction}>
              <Text style={styles.trimLabel}>Durée ({activeSelectedClip.duration.toFixed(1)}s)</Text>
              <View style={styles.sliderButtonsRow}>
                <TouchableOpacity style={styles.trimBtn} onPress={() => handleResizeClip(-0.5)}><Text style={styles.trimBtnText}>➖ -0.5s</Text></TouchableOpacity>
                <TouchableOpacity style={styles.trimBtn} onPress={() => handleResizeClip(0.5)}><Text style={styles.trimBtnText}>+0.5s ➕</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Text customizer */}
      {selectedClipType === 'text' && activeSelectedClip && activeTab === 'texte' && (
        <View style={styles.textCustomizerContainer}>
          <Text style={styles.textCustomizerTitle}>STYLE DU TEXTE</Text>
          <View style={styles.textCustomizerRow}>
            <View style={styles.textCustomizerField}>
              <Text style={styles.customizerLabel}>Taille ({(activeSelectedClip as TextClip).fontSize})</Text>
              <View style={styles.sliderButtonsRow}>
                <TouchableOpacity style={styles.sliderBtn} onPress={() => setTextClips((prev) => prev.map((t) => t.id === selectedClipId ? { ...t, fontSize: Math.max(10, t.fontSize - 2) } : t))}><Text style={styles.sliderBtnText}>-</Text></TouchableOpacity>
                <TouchableOpacity style={styles.sliderBtn} onPress={() => setTextClips((prev) => prev.map((t) => t.id === selectedClipId ? { ...t, fontSize: Math.min(40, t.fontSize + 2) } : t))}><Text style={styles.sliderBtnText}>+</Text></TouchableOpacity>
              </View>
            </View>
            <View style={styles.textCustomizerField}>
              <Text style={styles.customizerLabel}>Position Y ({(activeSelectedClip as TextClip).positionY}%)</Text>
              <View style={styles.sliderButtonsRow}>
                <TouchableOpacity style={styles.sliderBtn} onPress={() => setTextClips((prev) => prev.map((t) => t.id === selectedClipId ? { ...t, positionY: Math.max(10, t.positionY - 5) } : t))}><Text style={styles.sliderBtnText}>▲</Text></TouchableOpacity>
                <TouchableOpacity style={styles.sliderBtn} onPress={() => setTextClips((prev) => prev.map((t) => t.id === selectedClipId ? { ...t, positionY: Math.min(90, t.positionY + 5) } : t))}><Text style={styles.sliderBtnText}>▼</Text></TouchableOpacity>
              </View>
            </View>
            <View style={styles.textCustomizerField}>
              <Text style={styles.customizerLabel}>Couleur</Text>
              <View style={styles.colorPalette}>
                {['#FFFFFF', '#00E5FF', '#D500F9', '#FFFF00'].map((color) => (
                  <TouchableOpacity key={color} style={[styles.colorBubble, { backgroundColor: color }, (activeSelectedClip as TextClip).textColor === color && styles.selectedColorBubble]}
                    onPress={() => setTextClips((prev) => prev.map((t) => t.id === selectedClipId ? { ...t, textColor: color } : t))} />
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 6. Bottom Toolbar */}
      <View style={styles.bottomToolbar}>
        {[
          { tab: 'modifier', emoji: '✂️', label: 'Modifier' },
          { tab: 'audio', emoji: '🎵', label: 'Audio' },
          { tab: 'texte', emoji: '📝', label: 'Texte' },
          { tab: 'effets', emoji: '🪄', label: 'Effets' },
          { tab: 'filtres', emoji: '🎨', label: 'Filtres' },
          { tab: 'ajuster', emoji: '⚙️', label: 'Ajuster' },
          { tab: 'format', emoji: '📱', label: 'Format' },
          { tab: 'collage', emoji: '🖼️', label: 'Collage' }, // ← NOUVEAU
        ].map(({ tab, emoji, label }) => (
          <TouchableOpacity key={tab} style={[styles.toolbarItem, activeTab === tab && styles.activeToolbarItem]}
            onPress={() => setActiveTab(activeTab === tab ? 'none' : tab as ActiveTab)}>
            <Text style={styles.toolbarEmoji}>{emoji}</Text>
            <Text style={styles.toolbarText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── MODAL AUDIO ──────────────────────────────────────────────────── */}
      <Modal visible={showAudioModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { width: screenWidth - 20, maxHeight: '92%', padding: 0, overflow: 'hidden' }]}>

            {/* Header tabs */}
            <View style={styles.audioModalHeader}>
              {([
                { key: 'library', label: '🎵 Bibliothèque' },
                { key: 'import',  label: '📂 Importer' },
                { key: 'extract', label: '🎬 Extraire' },
                { key: 'controls',label: '⚙️ Réglages' },
              ] as { key: AudioModalTab; label: string }[]).map(({ key, label }) => (
                <TouchableOpacity key={key}
                  style={[styles.audioModalTab, audioModalTab === key && styles.audioModalTabActive]}
                  onPress={() => setAudioModalTab(key)}>
                  <Text style={[styles.audioModalTabText, audioModalTab === key && { color: '#10B981' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>

              {/* ── BIBLIOTHÈQUE ── */}
              {audioModalTab === 'library' && (
                <View>
                  {/* Recherche */}
                  <TextInput
                    style={styles.audioSearchInput}
                    placeholder="Rechercher titre ou artiste..."
                    placeholderTextColor="#555"
                    value={audioSearchQuery}
                    onChangeText={setAudioSearchQuery}
                  />
                  {/* Genres */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {AUDIO_GENRES.map(g => (
                        <TouchableOpacity key={g}
                          style={[styles.genrePill, audioGenreFilter === g && styles.genrePillActive]}
                          onPress={() => setAudioGenreFilter(g)}>
                          <Text style={[styles.genrePillText, audioGenreFilter === g && { color: '#10B981' }]}>{g}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  {/* Tracks */}
                  {filteredTracks.map(track => (
                    <View key={track.id} style={styles.trackRow2}>
                      <View style={styles.trackIconBox}>
                        <Text style={{ fontSize: 20 }}>🎵</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.trackName}>{track.name}</Text>
                        <Text style={styles.trackMeta}>{track.artist} • {track.genre} • {track.bpm} BPM</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.trackDur}>{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}</Text>
                        <TouchableOpacity
                          style={[styles.addTrackBtn, addedTrackIds.has(track.id) && styles.addTrackBtnAdded, downloadingId === track.id && styles.addTrackBtnLoading]}
                          onPress={() => handleAddFromLibrary(track)}
                          disabled={addedTrackIds.has(track.id) || downloadingId === track.id}>
                          <Text style={[styles.addTrackBtnText, addedTrackIds.has(track.id) && { color: '#10B981' }]}>
                            {downloadingId === track.id ? '...' : addedTrackIds.has(track.id) ? '✓ Ajouté' : '+ Ajouter'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  {filteredTracks.length === 0 && (
                    <Text style={{ color: '#555', textAlign: 'center', marginTop: 20, fontSize: 13 }}>Aucun résultat</Text>
                  )}
                  {/* SFX */}
                  <Text style={styles.audioSectionLabel}>Effets sonores</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {SFX_LIBRARY.map(sfx => (
                      <TouchableOpacity key={sfx.id} style={styles.sfxBtn} onPress={() => handleAddSfx(sfx)}>
                        <Text style={styles.sfxBtnText}>{sfx.name}</Text>
                        <Text style={styles.sfxDur}>{sfx.duration}s</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* ── IMPORTER ── */}
              {audioModalTab === 'import' && (
                <View>
                  <Text style={styles.audioSectionLabel}>Formats supportés</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {['MP3', 'WAV', 'AAC', 'M4A', 'OGG', 'FLAC'].map(f => (
                      <View key={f} style={styles.formatBadge}><Text style={styles.formatBadgeText}>{f}</Text></View>
                    ))}
                  </View>
                  <TouchableOpacity style={styles.importZone} onPress={handleImportAudioFile}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>📂</Text>
                    <Text style={{ color: '#ccc', fontSize: 13, fontWeight: '600' }}>Importer depuis la galerie</Text>
                    <Text style={{ color: '#555', fontSize: 11, marginTop: 4 }}>MP3, WAV, AAC, M4A — sélection multiple</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.importZone, { marginTop: 10, borderColor: '#3B82F6' }]} onPress={handleImportAudioFile}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>🎬</Text>
                    <Text style={{ color: '#ccc', fontSize: 13, fontWeight: '600' }}>Importer depuis une vidéo</Text>
                    <Text style={{ color: '#555', fontSize: 11, marginTop: 4 }}>Extrait automatiquement la piste audio</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── EXTRAIRE ── */}
              {audioModalTab === 'extract' && (
                <View>
                  <Text style={styles.audioSectionLabel}>Clips vidéo disponibles</Text>
                  {videoClips.map(clip => (
                    <View key={clip.id} style={styles.extractCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <View>
                          <Text style={styles.extractTitle}>{clip.name}</Text>
                          <Text style={styles.extractSub}>{clip.duration.toFixed(1)}s • stéréo 44kHz</Text>
                        </View>
                        <Text style={{ fontSize: 22 }}>🎬</Text>
                      </View>
                      {/* Barre de progression */}
                      <View style={styles.extractProgressBg}>
                        <View style={[styles.extractProgressFill, {
                          width: extractingClipId === clip.id ? `${extractProgress}%` : '0%'
                        }]} />
                      </View>
                      <TouchableOpacity
                        style={[styles.extractBtn, extractingClipId === clip.id && { borderColor: '#555' }]}
                        onPress={() => handleExtractAudio(clip)}
                        disabled={extractingClipId !== null}>
                        <Text style={[styles.extractBtnText, extractingClipId === clip.id && { color: '#555' }]}>
                          {extractingClipId === clip.id ? `Extraction ${extractProgress}%...` : '✂️ Extraire le son'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* ── RÉGLAGES ── */}
              {audioModalTab === 'controls' && (
                <View>
                  {(() => {
                    const clip = selectedClipType === 'audio'
                      ? audioClips.find(c => c.id === selectedClipId)
                      : selectedClipType === 'video'
                      ? videoClips.find(c => c.id === selectedClipId)
                      : null;
                    if (!clip) return (
                      <Text style={{ color: '#555', textAlign: 'center', fontSize: 13, marginTop: 20 }}>
                        Sélectionnez un clip audio ou vidéo sur la timeline.
                      </Text>
                    );
                    return (
                      <View style={styles.extractCard}>
                        <Text style={styles.extractTitle}>{clip.name}</Text>
                        <Text style={styles.extractSub}>
                          {clip.audioSource === 'extracted' ? 'Son extrait' : clip.audioSource === 'import' ? 'Fichier importé' : 'Bibliothèque'} • {clip.duration.toFixed(1)}s
                        </Text>
                        {/* Volume */}
                        <View style={{ marginTop: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={styles.extractSub}>Volume</Text>
                            <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold' }}>{clip.volume ?? 100}%</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={styles.volBtn} onPress={() => handleSetAudioVolume(-10)}><Text style={styles.volBtnText}>− 10%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.volBtn} onPress={() => handleSetAudioVolume(10)}><Text style={styles.volBtnText}>+ 10%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.volBtn} onPress={() => handleSetAudioVolume(100 - (clip.volume ?? 100))}><Text style={styles.volBtnText}>Reset</Text></TouchableOpacity>
                          </View>
                        </View>
                        {/* Muet */}
                        <TouchableOpacity style={[styles.extractBtn, { marginTop: 10 }, clip.muted && { borderColor: '#EF4444' }]}
                          onPress={handleToggleMute}>
                          <Text style={[styles.extractBtnText, clip.muted && { color: '#EF4444' }]}>
                            {clip.muted ? '🔇 Muet (actif) — appuyer pour réactiver' : '🔈 Activer le mode muet'}
                          </Text>
                        </TouchableOpacity>
                        {/* Fade — seulement pour audio */}
                        {selectedClipType === 'audio' && (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                            <TouchableOpacity style={[styles.extractBtn, { flex: 1 }, clip.fadeIn && { borderColor: '#10B981' }]}
                              onPress={() => handleToggleFade('fadeIn')}>
                              <Text style={[styles.extractBtnText, clip.fadeIn && { color: '#10B981' }]}>📈 Fondu entrant</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.extractBtn, { flex: 1 }, clip.fadeOut && { borderColor: '#10B981' }]}
                              onPress={() => handleToggleFade('fadeOut')}>
                              <Text style={[styles.extractBtnText, clip.fadeOut && { color: '#10B981' }]}>📉 Fondu sortant</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })()}
                </View>
              )}

            </ScrollView>

            {/* Fermer */}
            <TouchableOpacity style={styles.audioModalClose} onPress={() => setShowAudioModal(false)}>
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 13 }}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 7. Export Modal */}
      <Modal visible={exportProgress !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>EXPORTATION DU PROJET</Text>
            {exportProgress !== null && exportProgress < 100 ? (
              <>
                <ActivityIndicator size="large" color="#00E5FF" style={{ marginVertical: 20 }} />
                <View style={styles.progressBarWrapper}>
                  <View style={[styles.progressBarFill, { width: `${exportProgress}%` }]} />
                </View>
                <Text style={styles.progressPctText}>{exportProgress}%</Text>
                <Text style={styles.progressPhaseText}>{exportPhase}</Text>
              </>
            ) : (
              <>
                <Text style={styles.successEmoji}>🎉</Text>
                <Text style={styles.successTitle}>Rendu terminé avec succès !</Text>
                <Text style={styles.successSubtitle}>La vidéo a été encodée en 1080p et enregistrée localement.</Text>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setExportProgress(null)}>
                  <Text style={styles.modalCloseBtnText}>RETOUR À L'ÉDITEUR</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 8. ── MODAL COLLAGE BUILDER ────────────────────────────────────── */}
      <Modal visible={showCollageModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.collageModalContent}>
            <Text style={styles.modalTitle}>🖼️ CRÉER UN COLLAGE</Text>

            {/* Sélecteur de layout */}
            <Text style={styles.collageSectionLabel}>Choisir le format :</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row' }}>
                {(['2x1', '1x2', '2x2', '3x1', 'main+2'] as CollageLayout[]).map((layout) => (
                  <TouchableOpacity key={layout}
                    style={[styles.layoutOption, selectedLayout === layout && styles.layoutOptionActive]}
                    onPress={() => {
                      setSelectedLayout(layout);
                      setPendingCollagePhotos(importedPhotos.slice(0, getCollageSlotCount(layout)));
                    }}>
                    <Text style={styles.layoutOptionText}>{getLayoutLabel(layout)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Prévisualisation du collage */}
            <Text style={styles.collageSectionLabel}>Prévisualisation :</Text>
            <View style={styles.collagePreviewContainer}>
              <CollagePreview 
                config={{ layout: selectedLayout, slots: Array.from({ length: getCollageSlotCount(selectedLayout) }, (_, i) => ({ photoId: pendingCollagePhotos[i]?.id || null, flex: selectedLayout === 'main+2' && i === 0 ? 2 : 1 })), duration: 5, startTime: currentTime }} 
                photos={importedPhotos} 
              />
            </View>

            {/* Grille de sélection photos */}
            <Text style={styles.collageSectionLabel}>Photos disponibles ({importedPhotos.length}) :</Text>
            <FlatList
              data={importedPhotos}
              keyExtractor={(item) => item.id}
              horizontal
              style={{ maxHeight: 80, marginBottom: 12 }}
              renderItem={({ item, index }) => {
                const slotCount = getCollageSlotCount(selectedLayout);
                const isUsed = pendingCollagePhotos.slice(0, slotCount).some((p) => p?.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.photoThumb, isUsed && styles.photoThumbUsed]}
                    onPress={() => {
                      // Remplace le prochain slot vide ou cycle
                      setPendingCollagePhotos((prev) => {
                        const count = getCollageSlotCount(selectedLayout);
                        const copy = [...prev.slice(0, count)];
                        const emptyIdx = copy.findIndex((p) => !p || p.id === item.id);
                        if (emptyIdx !== -1) {
                          copy[emptyIdx] = item;
                        } else {
                          copy.push(item);
                        }
                        return copy.slice(0, count);
                      });
                    }}>
                    <Image source={{ uri: item.uri }} style={styles.photoThumbImage} />
                    {isUsed && <View style={styles.photoThumbCheck}><Text style={{ color: '#fff', fontSize: 10 }}>✓</Text></View>}
                  </TouchableOpacity>
                );
              }}
            />

            {/* Boutons */}
            <View style={styles.collageModalButtons}>
              <TouchableOpacity style={styles.collageCancelBtn} onPress={() => setShowCollageModal(false)}>
                <Text style={styles.collageCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.collageConfirmBtn} onPress={handleConfirmCollage}>
                <Text style={styles.collageConfirmBtnText}>✨ Insérer le collage</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 9. ── MODAL RÉSUMÉ MULTI-IMPORT VIDÉO ─────────────────────────── */}
      <Modal visible={showMultiImportModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🎞️ VIDÉOS IMPORTÉES</Text>
            <ScrollView style={{ maxHeight: 200, width: '100%', marginVertical: 15 }}>
              {importedVideoUris.map((v, idx) => (
                <View key={idx} style={styles.videoImportRow}>
                  <Text style={styles.videoImportIndex}>#{idx + 1}</Text>
                  <Text style={styles.videoImportName} numberOfLines={1}>{v.name}</Text>
                  <Text style={styles.videoImportDuration}>8.0s</Text>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.progressPhaseText}>Chaque vidéo est placée à la suite sur la timeline. Sélectionnez un clip pour l'ajuster.</Text>
            <TouchableOpacity style={[styles.modalCloseBtn, { marginTop: 15 }]} onPress={() => setShowMultiImportModal(false)}>
              <Text style={styles.modalCloseBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between' },
  header: { height: 55, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#222', zIndex: 20 },
  headerBtn: { backgroundColor: '#222', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  headerBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  resolutionContainer: { backgroundColor: '#222', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  resolutionText: { color: '#00E5FF', fontSize: 11, fontWeight: 'bold' },
  exportBtn: { backgroundColor: '#00E5FF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, shadowColor: '#00E5FF', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  exportBtnText: { color: '#000', fontSize: 12, fontWeight: 'bold' },
  previewContainer: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#050505', paddingHorizontal: 10 },
  previewWrapper: { backgroundColor: '#151515', borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333', position: 'relative' },
  video: { width: '100%', height: '100%' },
  placeholderContainer: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  placeholderEmoji: { fontSize: 36, marginBottom: 10 },
  placeholderText: { color: '#888', fontSize: 11, marginBottom: 15, textAlign: 'center' },
  importButtonsRow: { flexDirection: 'row', gap: 8 },
  importBtn: { backgroundColor: '#D500F9', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  importBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  audioMeterWrapper: { width: 8, height: 180, backgroundColor: '#111', borderRadius: 4, marginHorizontal: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  audioMeterBar: { width: '100%', borderRadius: 4, minHeight: 2 },
  guideLinesToggle: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, zIndex: 5 },
  guidesOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  horizontalGuideLine: { position: 'absolute', left: 0, right: 0, height: 1, borderStyle: 'dashed', borderWidth: 0.5, borderColor: 'rgba(0,229,255,0.4)' },
  verticalGuideLine: { position: 'absolute', top: 0, bottom: 0, width: 1, borderStyle: 'dashed', borderWidth: 0.5, borderColor: 'rgba(0,229,255,0.4)' },
  brightnessOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  filterOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  effectBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8 },
  previewTextContainer: { position: 'absolute', left: 10, right: 10, alignItems: 'center' },
  previewText: { fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, textAlign: 'center', textShadowColor: 'black', textShadowRadius: 2, textShadowOffset: { width: 1, height: 1 } },
  selectedPreviewText: { borderWidth: 1.5, borderColor: '#00E5FF', borderRadius: 4 },
  controlsRow: { height: 45, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: '#222' },
  timeCounter: { flexDirection: 'row', alignItems: 'center' },
  timeTextActive: { color: '#00E5FF', fontSize: 12, fontWeight: 'bold' },
  timeTextDivider: { color: '#666', fontSize: 12 },
  timeTextDuration: { color: '#888', fontSize: 12 },
  quickPlayControls: { flexDirection: 'row', alignItems: 'center' },
  controlIcon: { padding: 8, marginHorizontal: 4 },
  emojiIcon: { fontSize: 16 },
  playPauseBtn: { backgroundColor: '#222', borderRadius: 20, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  playPauseEmoji: { fontSize: 14 },
  quickHistory: { flexDirection: 'row', alignItems: 'center' },
  timelineContainer: { height: 210, backgroundColor: '#0c0c0c', position: 'relative', borderTopWidth: 1, borderTopColor: '#222' },
  zoomControlsContainer: { position: 'absolute', top: 5, right: 10, flexDirection: 'row', alignItems: 'center', zIndex: 15, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4, padding: 2 },
  zoomBtn: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#222', borderRadius: 3 },
  zoomBtnText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  zoomTextContainer: { paddingHorizontal: 6 },
  zoomText: { color: '#00E5FF', fontSize: 8, fontWeight: 'bold' },
  timelineScrollContent: { paddingLeft: screenWidth / 2, paddingRight: screenWidth / 2, alignItems: 'center' },
  tracksWrapper: { flexDirection: 'column', justifyContent: 'center' },
  rulerRow: { height: 25, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#222', marginBottom: 5, position: 'relative' },
  rulerTick: { alignItems: 'flex-start', position: 'relative' },
  rulerTickText: { color: '#555', fontSize: 8, position: 'absolute', bottom: 8, left: 2 },
  rulerLine: { width: 1, height: 7, backgroundColor: '#333' },
  rulerLineSub: { width: 0.5, height: 4, backgroundColor: '#222', position: 'absolute', bottom: 0 },
  trackRow: { height: 38, flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  trackLabel: { color: '#666', fontSize: 9, width: 55, fontWeight: 'bold' },
  trackLane: { height: 32, backgroundColor: '#151515', borderRadius: 6, width: 1200, position: 'relative' },
  clipBlock: { height: 28, borderRadius: 4, justifyContent: 'center', paddingLeft: 8, position: 'absolute', top: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  clipBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 6 },
  selectedClipBlock: { borderColor: '#00E5FF', borderWidth: 2, shadowColor: '#00E5FF', shadowOpacity: 0.8, shadowRadius: 4 },
  clipBlockText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  clipDurationSubtext: { color: 'rgba(255,255,255,0.4)', fontSize: 7, marginTop: -2 },
  waveformContainer: { position: 'absolute', top: 2, left: 4, right: 4, bottom: 2, flexDirection: 'row', alignItems: 'center', opacity: 0.4 },
  waveBar: { width: 2, backgroundColor: '#00E5FF', marginHorizontal: 1, borderRadius: 1 },
  audioClipText: { color: '#fff', fontSize: 9, fontWeight: 'bold', position: 'absolute', left: 8, top: 8, textShadowColor: 'black', textShadowRadius: 1 },
  keyframeDiamond: { position: 'absolute', top: 8, width: 8, height: 8, backgroundColor: '#FFFF00', transform: [{ rotate: '45deg' }], borderWidth: 0.5, borderColor: '#000' },
  // ── Collage clip sur timeline
  collageClipBlock: { backgroundColor: '#4C1D95', borderColor: '#A78BFA' },
  playhead: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: '#FF0000', zIndex: 10 },
  submenuContainer: { height: 110, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222', padding: 10 },
  submenuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  submenuTitle: { color: '#D500F9', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 },
  closeSubmenuBtn: { color: '#fff', fontSize: 14, paddingHorizontal: 5 },
  submenuScroll: { flex: 1 },
  submenuContent: { flexDirection: 'row', alignItems: 'center' },
  submenuItem: { width: 80, height: 60, backgroundColor: '#1a1a1a', borderRadius: 8, marginRight: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  activeSubmenuOption: { borderColor: '#00E5FF', backgroundColor: '#222' },
  submenuEmoji: { fontSize: 18, marginBottom: 2 },
  submenuText: { color: '#bbb', fontSize: 8, fontWeight: '500', textAlign: 'center' },
  submenuContentInputs: { flexDirection: 'row', alignItems: 'center', width: screenWidth - 20, height: 60 },
  textInput: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 6, color: '#fff', paddingHorizontal: 10, height: 40, fontSize: 12 },
  addTextBtn: { backgroundColor: '#00E5FF', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 6, marginLeft: 10 },
  submenuContentAjuster: { flexDirection: 'row', alignItems: 'center', height: 60 },
  sliderItem: { width: 130, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 6, marginRight: 10 },
  sliderLabel: { color: '#ccc', fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  sliderButtonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderBtn: { backgroundColor: '#333', width: 50, height: 25, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  sliderBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  trimPanelContainer: { height: 80, backgroundColor: '#090909', borderTopWidth: 1, borderTopColor: '#1e1e1e', padding: 8 },
  trimPanelTitle: { color: '#D500F9', fontSize: 8, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  trimPanelRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  trimPanelAction: { width: (screenWidth - 30) / 2, alignItems: 'center' },
  trimLabel: { color: '#888', fontSize: 8, marginBottom: 3 },
  trimBtn: { backgroundColor: '#222', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 4, marginHorizontal: 3, borderWidth: 0.5, borderColor: '#333' },
  trimBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  textCustomizerContainer: { height: 85, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#1e1e1e', padding: 8 },
  textCustomizerTitle: { color: '#00E5FF', fontSize: 8, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  textCustomizerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  textCustomizerField: { width: (screenWidth - 30) / 3, alignItems: 'center' },
  customizerLabel: { color: '#888', fontSize: 8, marginBottom: 3 },
  colorPalette: { flexDirection: 'row', justifyContent: 'center' },
  colorBubble: { width: 16, height: 16, borderRadius: 8, marginHorizontal: 2, borderWidth: 1, borderColor: '#333' },
  selectedColorBubble: { borderColor: '#00E5FF', borderWidth: 1.5, transform: [{ scale: 1.2 }] },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: screenWidth - 60, backgroundColor: '#111', borderRadius: 16, padding: 25, alignItems: 'center', borderWidth: 1.5, borderColor: '#222' },
  modalTitle: { color: '#00E5FF', fontWeight: 'bold', fontSize: 14, letterSpacing: 2, marginBottom: 20 },
  progressBarWrapper: { width: '100%', height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  progressBarFill: { height: '100%', backgroundColor: '#00E5FF' },
  progressPctText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 10 },
  progressPhaseText: { color: '#666', fontSize: 12, marginTop: 5, fontStyle: 'italic', textAlign: 'center' },
  successEmoji: { fontSize: 48, marginBottom: 15 },
  successTitle: { color: '#D500F9', fontWeight: 'bold', fontSize: 16, textAlign: 'center', marginBottom: 10 },
  successSubtitle: { color: '#888', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 25 },
  modalCloseBtn: { backgroundColor: '#00E5FF', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25 },
  modalCloseBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
  bottomToolbar: { height: 60, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#222' },
  toolbarItem: { justifyContent: 'center', alignItems: 'center', paddingVertical: 5 },
  activeToolbarItem: { borderBottomWidth: 2, borderBottomColor: '#00E5FF' },
  toolbarEmoji: { fontSize: 18, marginBottom: 4 },
  toolbarText: { color: '#888', fontSize: 9, fontWeight: '600' },

  // ── Collage styles ─────────────────────────────────────────────────────
  collagePreview: { width: '100%', height: '100%' },
  collageSlot: { flex: 1, borderWidth: 1, borderColor: '#333', overflow: 'hidden' },
  collageSlotImage: { width: '100%', height: '100%' },
  collageSlotEmpty: { flex: 1, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  collageModalContent: { width: screenWidth - 30, backgroundColor: '#111', borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: '#333', maxHeight: '90%' },
  collagePreviewContainer: { width: '100%', height: 160, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#333', marginBottom: 12 },
  collageSectionLabel: { color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 },
  layoutOption: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#1a1a1a', borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#333' },
  layoutOptionActive: { borderColor: '#A78BFA', backgroundColor: '#2E1065' },
  layoutOptionText: { color: '#ccc', fontSize: 11, fontWeight: '600' },
  photoThumb: { width: 68, height: 68, borderRadius: 6, marginRight: 8, overflow: 'hidden', borderWidth: 2, borderColor: '#333' },
  photoThumbUsed: { borderColor: '#A78BFA' },
  photoThumbImage: { width: '100%', height: '100%' },
  photoThumbCheck: { position: 'absolute', top: 4, right: 4, backgroundColor: '#7C3AED', borderRadius: 10, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  collageModalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  collageCancelBtn: { flex: 1, paddingVertical: 12, backgroundColor: '#222', borderRadius: 10, marginRight: 8, alignItems: 'center' },
  collageCancelBtnText: { color: '#888', fontWeight: 'bold', fontSize: 13 },
  collageConfirmBtn: { flex: 2, paddingVertical: 12, backgroundColor: '#7C3AED', borderRadius: 10, alignItems: 'center' },
  collageConfirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  // ── Multi-import modal ──────────────────────────────────────────────────
  videoImportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  videoImportIndex: { color: '#7C3AED', fontSize: 12, fontWeight: 'bold', width: 28 },
  videoImportName: { flex: 1, color: '#ccc', fontSize: 12 },
  videoImportDuration: { color: '#555', fontSize: 11, marginLeft: 8 },

  // ── Audio modal styles ─────────────────────────────────────────────────
  audioModalHeader: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderBottomWidth: 1, borderBottomColor: '#222' },
  audioModalTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  audioModalTabActive: { borderBottomColor: '#10B981' },
  audioModalTabText: { color: '#555', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  audioModalClose: { backgroundColor: '#10B981', margin: 14, borderRadius: 25, height: 40, justifyContent: 'center', alignItems: 'center' },
  audioSearchInput: { backgroundColor: '#1a1a1a', borderRadius: 8, color: '#fff', paddingHorizontal: 12, height: 38, fontSize: 12, borderWidth: 1, borderColor: '#333', marginBottom: 10 },
  genrePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: '#333', backgroundColor: '#1a1a1a' },
  genrePillActive: { borderColor: '#10B981', backgroundColor: '#064E3B' },
  genrePillText: { color: '#666', fontSize: 11 },
  audioSectionLabel: { color: '#555', fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 8 } as any,
  trackRow2: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: '#1e1e1e', gap: 10 },
  trackIconBox: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#1a2a1a', justifyContent: 'center', alignItems: 'center' },
  trackName: { color: '#fff', fontSize: 12, fontWeight: '600' },
  trackMeta: { color: '#555', fontSize: 10, marginTop: 2 },
  trackDur: { color: '#555', fontSize: 10 },
  addTrackBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: '#10B981' },
  addTrackBtnAdded: { backgroundColor: '#064E3B', borderColor: '#10B981' },
  addTrackBtnLoading: { borderColor: '#555' },
  addTrackBtnText: { color: '#ccc', fontSize: 10, fontWeight: '600' },
  sfxBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 0.5, borderColor: '#333', backgroundColor: '#1a1a1a' },
  sfxBtnText: { color: '#ccc', fontSize: 11 },
  sfxDur: { color: '#555', fontSize: 9, textAlign: 'center', marginTop: 2 },
  formatBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#1a1a1a', borderWidth: 0.5, borderColor: '#333' },
  formatBadgeText: { color: '#888', fontSize: 11 },
  importZone: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#333', borderRadius: 12, padding: 20, alignItems: 'center' },
  extractCard: { backgroundColor: '#111', borderRadius: 10, borderWidth: 0.5, borderColor: '#333', padding: 12, marginBottom: 10 },
  extractTitle: { color: '#fff', fontSize: 12, fontWeight: '600' },
  extractSub: { color: '#555', fontSize: 10, marginTop: 2 },
  extractProgressBg: { height: 4, borderRadius: 2, backgroundColor: '#222', overflow: 'hidden', marginVertical: 8 },
  extractProgressFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 2 },
  extractBtn: { borderRadius: 8, borderWidth: 0.5, borderColor: '#8B5CF6', paddingVertical: 9, alignItems: 'center' },
  extractBtnText: { color: '#8B5CF6', fontSize: 11, fontWeight: '600' },
  volBtn: { flex: 1, height: 30, borderRadius: 6, borderWidth: 0.5, borderColor: '#333', backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  volBtnText: { color: '#ccc', fontSize: 11 },
  miniVolBtn: { width: 28, height: 22, borderRadius: 4, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  miniVolBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
