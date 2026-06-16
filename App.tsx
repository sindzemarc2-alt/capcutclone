import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { supabase } from './src/lib/supabase';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import EditorScreen from './src/screens/EditorScreen';

export default function App() {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    // 1. On récupère la session actuelle au démarrage
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      
      // On garde le splash au moins 3 secondes pour l'effet visuel
      setTimeout(() => {
        setIsSplashVisible(false);
      }, 3000);
    });

    // 2. On écoute les changements d'état d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Affichage conditionnel
  if (isSplashVisible) {
    return <SplashScreen />;
  }

  return (
    <View style={styles.container}>
      {session ? (
        <EditorScreen />
      ) : (
        <LoginScreen />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  welcomeText: { color: '#00E5FF', fontSize: 24, fontWeight: 'bold' }
});