import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

export default function SplashScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const textAnim = useRef(new Animated.Value(0)).current; // Animation pour le texte

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.timing(textAnim, {
        toValue: 1,
        duration: 1500,
        delay: 500, // Le texte apparaît un peu après le logo
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, textAnim]);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require('../../assets/logo.png')}
        style={[
          styles.logo,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
        ]}
      />
      <Animated.Text style={[styles.appName, { opacity: textAnim }]}>
        CAPCUT PRO
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  logo: { 
    width: 200, 
    height: 200, 
    resizeMode: 'contain' 
  },
  appName: {
    marginTop: 20,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00E5FF', // Bleu Neon
    letterSpacing: 4,
    textShadowColor: '#D500F9', // Violet Neon en ombre
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  }
});