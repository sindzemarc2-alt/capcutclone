export interface VideoClip {
  id: string;
  uri: string;
  duration: number;
  startTime: number; // Pour le trimming
  endTime: number;
}