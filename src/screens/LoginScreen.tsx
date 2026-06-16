import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Alert, Image, ActivityIndicator, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const clearSession = async () => {
      await supabase.auth.signOut();
    };
    clearSession();
  }, []);

  async function handleSignIn() {
    Keyboard.dismiss();
    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (!cleanEmail || !cleanPassword) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ 
        email: cleanEmail, 
        password: cleanPassword 
      });
      if (error) {
        Alert.alert("Erreur", error.message);
      }
    } catch (err: any) {
      Alert.alert("Erreur Système", err.message || "Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp() {
    Keyboard.dismiss();
    const cleanEmail = email.trim();
    const cleanPassword = password;
    const cleanUsername = username.trim();

    if (!cleanEmail || !cleanPassword || !confirmPassword || !cleanUsername) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs.");
      return;
    }

    if (cleanPassword !== confirmPassword) {
      Alert.alert("Erreur", "Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ 
        email: cleanEmail, 
        password: cleanPassword,
        options: {
          data: {
            username: cleanUsername,
          }
        }
      });
      
      if (error) {
        Alert.alert("Erreur", error.message);
      } else {
        Alert.alert(
          "Succès", 
          "Compte créé avec succès ! Si requis, veuillez vérifier vos e-mails pour confirmer votre inscription."
        );
        setIsSignUp(false); // Switch back to login screen on success
      }
    } catch (err: any) {
      Alert.alert("Erreur Système", err.message || "Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} />
      <Text style={styles.title}>
        {isSignUp ? (
          <>CAPCUT <Text style={{color: '#D500F9'}}>INSCRIPTION</Text></>
        ) : (
          <>CAPCUT <Text style={{color: '#D500F9'}}>PRO</Text></>
        )}
      </Text>
      
      {isSignUp && (
        <TextInput 
          placeholder="Nom d'utilisateur" 
          placeholderTextColor="#666"
          onChangeText={setUsername} 
          style={styles.input} 
          autoCapitalize="words"
          value={username}
        />
      )}

      <TextInput 
        placeholder="Email" 
        placeholderTextColor="#666"
        onChangeText={setEmail} 
        style={styles.input} 
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
      />
      
      <TextInput 
        placeholder="Mot de passe" 
        placeholderTextColor="#666"
        onChangeText={setPassword} 
        secureTextEntry 
        style={styles.input} 
        value={password}
      />

      {isSignUp && (
        <TextInput 
          placeholder="Confirmer le mot de passe" 
          placeholderTextColor="#666"
          onChangeText={setConfirmPassword} 
          secureTextEntry 
          style={styles.input} 
          value={confirmPassword}
        />
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#00E5FF" style={{marginVertical: 20}} />
      ) : (
        <>
          {isSignUp ? (
            <>
              <TouchableOpacity activeOpacity={0.7} style={styles.btnPrimary} onPress={handleSignUp}>
                <Text style={styles.btnText}>S'INSCRIRE</Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.7} style={styles.btnSecondary} onPress={() => setIsSignUp(false)}>
                <Text style={[styles.btnText, {color: '#D500F9'}]}>RETOUR À LA CONNEXION</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity activeOpacity={0.7} style={styles.btnPrimary} onPress={handleSignIn}>
                <Text style={styles.btnText}>SE CONNECTER</Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.7} style={styles.btnSecondary} onPress={() => setIsSignUp(true)}>
                <Text style={[styles.btnText, {color: '#D500F9'}]}>CRÉER UN COMPTE</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      <View style={styles.divider} />
      <TouchableOpacity activeOpacity={0.7} style={styles.googleBtn}>
        <Text style={styles.googleText}>Continuer avec Google</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 30 },
  logo: { width: 100, height: 100, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#00E5FF', textAlign: 'center', marginBottom: 40, letterSpacing: 2 },
  input: { backgroundColor: '#111', borderBottomWidth: 2, borderBottomColor: '#00E5FF', padding: 15, color: '#fff', marginBottom: 20, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#00E5FF', padding: 15, borderRadius: 30, alignItems: 'center', marginTop: 10 },
  btnSecondary: { borderWidth: 2, borderColor: '#D500F9', padding: 15, borderRadius: 30, alignItems: 'center', marginTop: 15 },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 30 },
  googleBtn: { backgroundColor: '#fff', padding: 15, borderRadius: 30, alignItems: 'center' },
  googleText: { color: '#000', fontWeight: '600' }
});