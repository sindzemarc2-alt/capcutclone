
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://skmpdjwbhivkrowdrrea.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrbXBkandiaGl2a3Jvd2RycmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDcyMzYsImV4cCI6MjA5Njg4MzIzNn0.sehK1d0k_2raGlpefzwaRrcJIzVla6dW0a7CsXeV7Rs';
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
  },
});



