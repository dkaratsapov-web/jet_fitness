// Shared shaping of a WorkoutLog (+ its set logs) into a compact summary
// used by both the client history and the coach's client view.

export interface WorkoutWithSets {
  id: string;
  date: Date;
  completedAt: Date | null;
  setLogs: Array<{
    programExerciseId: string;
    actualReps: number | null;
    actualWeight: number | null;
    programExercise: {
      programDay: { title: string | null; order: number } | null;
    };
  }>;
}

export interface WorkoutSummary {
  id: string;
  date: Date;
  completedAt: Date | null;
  dayTitle: string | null;
  setCount: number;
  exerciseCount: number;
  totalVolume: number; // Σ reps × weight, a rough training-load proxy.
}

export function summarizeWorkout(w: WorkoutWithSets): WorkoutSummary {
  const exerciseIds = new Set<string>();
  let totalVolume = 0;
  let dayTitle: string | null = null;
  let bestOrder = Infinity;

  for (const s of w.setLogs) {
    exerciseIds.add(s.programExerciseId);
    if (s.actualReps != null && s.actualWeight != null) {
      totalVolume += s.actualReps * s.actualWeight;
    }
    const day = s.programExercise.programDay;
    if (day && day.order < bestOrder) {
      bestOrder = day.order;
      dayTitle = day.title;
    }
  }

  return {
    id: w.id,
    date: w.date,
    completedAt: w.completedAt,
    dayTitle,
    setCount: w.setLogs.length,
    exerciseCount: exerciseIds.size,
    totalVolume: Math.round(totalVolume),
  };
}
