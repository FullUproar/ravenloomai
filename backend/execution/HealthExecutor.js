import db from '../db.js';

export class HealthExecutor {
  
  async executeHealthTask(task, projectConfig) {
    switch (task.type) {
      case 'calorie_calculation':
        return await this.calculateDailyCalories(task, projectConfig);
      case 'meal_planning':
        return await this.generateMealPlan(task, projectConfig);
      case 'workout_creation':
        return await this.createWorkoutPlan(task, projectConfig);
      case 'progress_tracking':
        return await this.trackProgress(task, projectConfig);
      case 'hydration_planning':
        return await this.calculateHydrationNeeds(task, projectConfig);
      case 'macro_calculation':
        return await this.calculateMacros(task, projectConfig);
      default:
        return await this.executeGenericHealthTask(task, projectConfig);
    }
  }

  async calculateDailyCalories(task, config) {
    const { 
      current_weight = 180, 
      height_inches = 70, 
      age = 30, 
      gender = 'male',
      activity_level = 'sedentary',
      goal = 'weight_loss'
    } = config;

    // Calculate BMR using Mifflin-St Jeor Equation
    let bmr;
    if (gender.toLowerCase() === 'male') {
      bmr = (10 * (current_weight * 0.453592)) + (6.25 * (height_inches * 2.54)) - (5 * age) + 5;
    } else {
      bmr = (10 * (current_weight * 0.453592)) + (6.25 * (height_inches * 2.54)) - (5 * age) - 161;
    }

    // Activity multipliers
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };

    const maintenanceCalories = Math.round(bmr * (activityMultipliers[activity_level] || 1.2));
    
    // Goal adjustments
    let targetCalories = maintenanceCalories;
    if (goal === 'weight_loss') {
      targetCalories = maintenanceCalories - 500; // 1 lb per week
    } else if (goal === 'weight_gain') {
      targetCalories = maintenanceCalories + 500;
    }

    const result = {
      type: 'calorie_calculation',
      bmr: Math.round(bmr),
      maintenance_calories: maintenanceCalories,
      target_calories: targetCalories,
      deficit_surplus: targetCalories - maintenanceCalories,
      calculation_date: new Date().toISOString(),
      inputs: { current_weight, height_inches, age, gender, activity_level, goal }
    };

    // Record as metric
    await this.recordMetric(task.project_id, task.goal_id, 'Daily Calorie Target', targetCalories, 'calories');
    await this.recordMetric(task.project_id, task.goal_id, 'BMR', Math.round(bmr), 'calories');

    return result;
  }

  async generateMealPlan(task, config) {
    const { target_calories = 2000, dietary_restrictions = [], meal_count = 3 } = config;
    
    // Simple meal planning logic
    const mealTemplates = {
      breakfast: [
        { name: 'Oatmeal with berries', calories: 300, protein: 10, carbs: 55, fat: 5 },
        { name: 'Greek yogurt with granola', calories: 250, protein: 15, carbs: 30, fat: 8 },
        { name: 'Scrambled eggs with toast', calories: 350, protein: 20, carbs: 25, fat: 18 },
        { name: 'Smoothie bowl', calories: 280, protein: 12, carbs: 45, fat: 8 }
      ],
      lunch: [
        { name: 'Grilled chicken salad', calories: 400, protein: 35, carbs: 15, fat: 22 },
        { name: 'Turkey sandwich', calories: 450, protein: 25, carbs: 45, fat: 18 },
        { name: 'Quinoa bowl with vegetables', calories: 380, protein: 15, carbs: 50, fat: 12 },
        { name: 'Soup and whole grain roll', calories: 320, protein: 12, carbs: 40, fat: 12 }
      ],
      dinner: [
        { name: 'Baked salmon with sweet potato', calories: 500, protein: 40, carbs: 35, fat: 20 },
        { name: 'Lean beef stir-fry', calories: 480, protein: 35, carbs: 30, fat: 22 },
        { name: 'Chicken breast with rice and broccoli', calories: 450, protein: 38, carbs: 40, fat: 12 },
        { name: 'Vegetarian pasta', calories: 420, protein: 15, carbs: 65, fat: 12 }
      ],
      snack: [
        { name: 'Apple with almond butter', calories: 180, protein: 6, carbs: 20, fat: 10 },
        { name: 'Greek yogurt', calories: 100, protein: 15, carbs: 8, fat: 0 },
        { name: 'Mixed nuts', calories: 160, protein: 6, carbs: 6, fat: 14 },
        { name: 'Protein shake', calories: 120, protein: 20, carbs: 5, fat: 2 }
      ]
    };

    const caloriesPerMeal = Math.floor(target_calories / meal_count);
    const plan = [];

    // Generate meals for 7 days
    for (let day = 1; day <= 7; day++) {
      const dayPlan = {
        day: day,
        meals: [],
        total_calories: 0,
        total_protein: 0,
        total_carbs: 0,
        total_fat: 0
      };

      // Select meals that fit calorie targets
      const breakfast = mealTemplates.breakfast[Math.floor(Math.random() * mealTemplates.breakfast.length)];
      const lunch = mealTemplates.lunch[Math.floor(Math.random() * mealTemplates.lunch.length)];
      const dinner = mealTemplates.dinner[Math.floor(Math.random() * mealTemplates.dinner.length)];
      
      dayPlan.meals = [breakfast, lunch, dinner];
      
      // Add snacks if needed to reach calorie target
      const remainingCalories = target_calories - (breakfast.calories + lunch.calories + dinner.calories);
      if (remainingCalories > 100) {
        const snack = mealTemplates.snack[Math.floor(Math.random() * mealTemplates.snack.length)];
        dayPlan.meals.push(snack);
      }

      // Calculate totals
      dayPlan.total_calories = dayPlan.meals.reduce((sum, meal) => sum + meal.calories, 0);
      dayPlan.total_protein = dayPlan.meals.reduce((sum, meal) => sum + meal.protein, 0);
      dayPlan.total_carbs = dayPlan.meals.reduce((sum, meal) => sum + meal.carbs, 0);
      dayPlan.total_fat = dayPlan.meals.reduce((sum, meal) => sum + meal.fat, 0);

      plan.push(dayPlan);
    }

    const result = {
      type: 'meal_planning',
      target_calories,
      plan_duration: '7 days',
      meal_plan: plan,
      generated_at: new Date().toISOString(),
      dietary_restrictions
    };

    return result;
  }

  async createWorkoutPlan(task, config) {
    const { 
      fitness_level = 'beginner',
      available_time = 30,
      equipment = ['bodyweight'],
      goal = 'general_fitness'
    } = config;

    const workoutTemplates = {
      beginner: {
        strength: [
          { exercise: 'Push-ups', sets: 3, reps: '8-12', rest: '60s' },
          { exercise: 'Bodyweight squats', sets: 3, reps: '12-15', rest: '60s' },
          { exercise: 'Plank', sets: 3, reps: '30s hold', rest: '60s' },
          { exercise: 'Lunges', sets: 2, reps: '10 each leg', rest: '60s' }
        ],
        cardio: [
          { exercise: 'Walking', duration: '20-30 minutes', intensity: 'moderate' },
          { exercise: 'Jumping jacks', sets: 3, reps: '30s', rest: '30s' },
          { exercise: 'High knees', sets: 3, reps: '30s', rest: '30s' }
        ]
      },
      intermediate: {
        strength: [
          { exercise: 'Push-ups', sets: 4, reps: '12-15', rest: '45s' },
          { exercise: 'Squats', sets: 4, reps: '15-20', rest: '45s' },
          { exercise: 'Plank', sets: 3, reps: '45s hold', rest: '45s' },
          { exercise: 'Burpees', sets: 3, reps: '8-10', rest: '60s' },
          { exercise: 'Mountain climbers', sets: 3, reps: '30s', rest: '45s' }
        ],
        cardio: [
          { exercise: 'Running/Jogging', duration: '25-35 minutes', intensity: 'moderate' },
          { exercise: 'HIIT circuit', duration: '20 minutes', intensity: 'high' }
        ]
      }
    };

    // Generate 4-week workout plan
    const weeklyPlan = [];
    const exercisePool = workoutTemplates[fitness_level] || workoutTemplates.beginner;
    
    for (let week = 1; week <= 4; week++) {
      const weekPlan = {
        week: week,
        workouts: []
      };

      // 3 workouts per week: 2 strength, 1 cardio
      for (let day = 1; day <= 3; day++) {
        const workout = {
          day: day,
          type: day === 3 ? 'cardio' : 'strength',
          duration: available_time,
          exercises: day === 3 ? exercisePool.cardio : exercisePool.strength
        };
        weekPlan.workouts.push(workout);
      }
      
      weeklyPlan.push(weekPlan);
    }

    const result = {
      type: 'workout_creation',
      fitness_level,
      goal,
      equipment,
      plan_duration: '4 weeks',
      workout_plan: weeklyPlan,
      generated_at: new Date().toISOString()
    };

    return result;
  }

  async calculateHydrationNeeds(task, config) {
    const { current_weight = 180, activity_level = 'sedentary' } = config;
    
    // Basic hydration calculation: 0.5-1 oz per pound of body weight
    const baseWater = current_weight * 0.67; // oz per day
    
    // Activity adjustments
    const activityMultipliers = {
      sedentary: 1.0,
      light: 1.1,
      moderate: 1.2,
      active: 1.3,
      very_active: 1.4
    };
    
    const dailyWaterOz = Math.round(baseWater * (activityMultipliers[activity_level] || 1.0));
    const dailyWaterCups = Math.round(dailyWaterOz / 8);
    const dailyWaterLiters = Math.round((dailyWaterOz / 33.814) * 10) / 10;

    const result = {
      type: 'hydration_planning',
      daily_water_oz: dailyWaterOz,
      daily_water_cups: dailyWaterCups,
      daily_water_liters: dailyWaterLiters,
      recommendation: `Drink ${dailyWaterCups} cups (${dailyWaterLiters}L) of water daily`,
      calculated_at: new Date().toISOString()
    };

    // Record as metric
    await this.recordMetric(task.project_id, task.goal_id, 'Daily Water Target', dailyWaterLiters, 'liters');

    return result;
  }

  async calculateMacros(task, config) {
    const { target_calories = 2000, goal = 'weight_loss' } = config;
    
    // Macro distributions by goal
    const macroRatios = {
      weight_loss: { protein: 0.30, carbs: 0.35, fat: 0.35 },
      muscle_gain: { protein: 0.25, carbs: 0.45, fat: 0.30 },
      maintenance: { protein: 0.20, carbs: 0.50, fat: 0.30 }
    };

    const ratios = macroRatios[goal] || macroRatios.maintenance;
    
    const proteinCalories = target_calories * ratios.protein;
    const carbCalories = target_calories * ratios.carbs;
    const fatCalories = target_calories * ratios.fat;

    const result = {
      type: 'macro_calculation',
      target_calories,
      goal,
      macros: {
        protein: {
          calories: Math.round(proteinCalories),
          grams: Math.round(proteinCalories / 4),
          percentage: Math.round(ratios.protein * 100)
        },
        carbs: {
          calories: Math.round(carbCalories),
          grams: Math.round(carbCalories / 4),
          percentage: Math.round(ratios.carbs * 100)
        },
        fat: {
          calories: Math.round(fatCalories),
          grams: Math.round(fatCalories / 9),
          percentage: Math.round(ratios.fat * 100)
        }
      },
      calculated_at: new Date().toISOString()
    };

    return result;
  }

  async trackProgress(task, config) {
    // Get recent weight measurements
    const weightMetrics = await db.query(
      `SELECT value, recorded_at FROM metrics 
       WHERE project_id = $1 AND name = 'Weight' 
       ORDER BY recorded_at DESC LIMIT 30`,
      [task.project_id]
    );

    const weights = weightMetrics.rows.map(row => ({
      weight: row.value,
      date: row.recorded_at
    }));

    let progress = {
      type: 'progress_tracking',
      current_weight: weights[0]?.weight || config.current_weight,
      starting_weight: weights[weights.length - 1]?.weight || config.current_weight,
      measurements_count: weights.length,
      trend: 'stable'
    };

    if (weights.length >= 2) {
      const recentWeight = weights[0].weight;
      const previousWeight = weights[1].weight;
      const totalChange = progress.current_weight - progress.starting_weight;
      
      progress.recent_change = Math.round((recentWeight - previousWeight) * 10) / 10;
      progress.total_change = Math.round(totalChange * 10) / 10;
      
      if (progress.recent_change > 0.5) progress.trend = 'increasing';
      else if (progress.recent_change < -0.5) progress.trend = 'decreasing';
      
      if (weights.length >= 7) {
        const weekAgoWeight = weights[6]?.weight || recentWeight;
        progress.weekly_change = Math.round((recentWeight - weekAgoWeight) * 10) / 10;
      }
    }

    progress.tracked_at = new Date().toISOString();
    return progress;
  }

  async executeGenericHealthTask(task, config) {
    // Fallback for non-specific health tasks
    return {
      type: 'generic_health',
      task_title: task.title,
      executed_at: new Date().toISOString(),
      status: 'completed',
      note: 'Generic health task completed - consider using specific health task types for better automation'
    };
  }

  async recordMetric(projectId, goalId, name, value, unit, source = 'automated') {
    await db.query(
      `INSERT INTO metrics (project_id, goal_id, name, value, unit, source, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [projectId, goalId, name, value, unit, source]
    );
  }
}