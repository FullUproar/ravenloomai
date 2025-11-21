/**
 * Test User Personas
 *
 * Realistic user profiles based on common productivity challenges.
 * Each persona includes goals, personality traits, and communication style.
 */

export const TEST_PERSONAS = {
  overwhelmedFounder: {
    name: 'Sarah Chen',
    role: 'Startup Founder',
    age: 32,
    goal: 'Launch MVP by April 2026',
    challenges: [
      'Too many responsibilities (product, sales, hiring)',
      'Constant context switching',
      'Feeling behind on everything',
      'Imposter syndrome'
    ],
    personalityTraits: {
      communicationStyle: 'Direct and efficient, sometimes scattered',
      motivationLevel: 'High but anxious',
      techSavvy: 'Very',
      preferredTone: 'Strategic and actionable'
    },
    typicalResponses: {
      whenAskedAboutGoal: 'I need to launch my SaaS product in 4 months. Have investors waiting and running out of runway.',
      whenAskedAboutSuccess: 'First paying customers, revenue, product-market fit. 1000 users would be amazing.',
      whenAskedAboutChallenges: 'Everything is a priority. I\'m coding, selling, hiring, fundraising all at once.',
      whenAskedAboutWorkStyle: 'Need to move fast, make progress daily, can\'t afford to waste time'
    },
    projects: [
      {
        title: 'Launch SaaS MVP',
        outcome: '1000 active users by April 20, 2026',
        completionType: 'milestone'
      }
    ]
  },

  fitnessStruggler: {
    name: 'Mike Rodriguez',
    role: 'Software Engineer',
    age: 28,
    goal: 'Lose 30 pounds and build consistent exercise habit',
    challenges: [
      'Starts strong then gives up',
      'Desk job, sedentary lifestyle',
      'Stress eating',
      'All-or-nothing thinking'
    ],
    personalityTraits: {
      communicationStyle: 'Honest about struggles, self-deprecating',
      motivationLevel: 'Fluctuates - high at start, drops quickly',
      techSavvy: 'Moderate',
      preferredTone: 'Supportive and non-judgmental'
    },
    typicalResponses: {
      whenAskedAboutGoal: 'I want to lose 30 pounds. I\'ve tried so many times before but always fall off track.',
      whenAskedAboutSuccess: 'Feeling confident in my body, having energy, fitting into my old clothes again',
      whenAskedAboutChallenges: 'I do great for 2 weeks then life gets busy and I stop. Or I mess up once and think "screw it" and quit',
      whenAskedAboutWorkStyle: 'Need something sustainable, not another crash diet that I\'ll abandon'
    },
    projects: [
      {
        title: 'Lose 30 pounds',
        outcome: 'Reach 180 lbs by September 2026',
        completionType: 'habit_formation'
      }
    ]
  },

  careerChanger: {
    name: 'Lisa Park',
    role: 'Teacher transitioning to UX Design',
    age: 35,
    goal: 'Land first UX design job',
    challenges: [
      'Learning while working full-time',
      'No design experience or portfolio',
      'Limited time (teaching + family)',
      'Feeling like starting over'
    ],
    personalityTraits: {
      communicationStyle: 'Thoughtful, asks clarifying questions',
      motivationLevel: 'Determined but tired',
      techSavvy: 'Learning',
      preferredTone: 'Encouraging but realistic'
    },
    typicalResponses: {
      whenAskedAboutGoal: 'I want to transition from teaching to UX design. Need to build a portfolio and land my first design job.',
      whenAskedAboutSuccess: 'Getting hired as a junior UX designer by end of year. Having a portfolio of 3-5 projects.',
      whenAskedAboutChallenges: 'I only have evenings and weekends. Full-time teaching drains my energy. Need to learn so much.',
      whenAskedAboutWorkStyle: 'Small consistent progress. I can commit 1-2 hours most evenings after kids sleep.'
    },
    projects: [
      {
        title: 'Career transition to UX design',
        outcome: 'Land UX design job by December 2026',
        completionType: 'milestone'
      }
    ]
  },

  distractedRemote: {
    name: 'James Wilson',
    role: 'Marketing Manager',
    age: 29,
    goal: 'Ship major campaign launch',
    challenges: [
      'Constant Slack interruptions',
      'Too many meetings',
      'Home distractions (roommates, deliveries)',
      'Procrastination and context switching'
    ],
    personalityTraits: {
      communicationStyle: 'Casual, admits to distractions',
      motivationLevel: 'Medium - wants to improve',
      techSavvy: 'Very',
      preferredTone: 'Practical and accountability-focused'
    },
    typicalResponses: {
      whenAskedAboutGoal: 'Launch our Q2 marketing campaign. It\'s a big deal but I keep putting off the hard work.',
      whenAskedAboutSuccess: 'Campaign launches on time with all assets ready. Email sequences, landing pages, ads - everything done.',
      whenAskedAboutChallenges: 'I get distracted constantly. Slack pings, random YouTube videos, emails. I waste so much time.',
      whenAskedAboutWorkStyle: 'Need focused blocks with no interruptions. Maybe work sprints with accountability check-ins?'
    },
    projects: [
      {
        title: 'Q2 Campaign Launch',
        outcome: 'Campaign live by June 1, 2026',
        completionType: 'milestone'
      }
    ]
  },

  stressedStudent: {
    name: 'Emma Thompson',
    role: 'Graduate Student',
    age: 24,
    goal: 'Finish thesis and graduate',
    challenges: [
      'Multiple deadlines approaching',
      'Perfectionism and analysis paralysis',
      'Anxiety about post-graduation plans',
      'Feeling overwhelmed by research'
    ],
    personalityTraits: {
      communicationStyle: 'Detailed, sometimes anxious',
      motivationLevel: 'High but stressed',
      techSavvy: 'Moderate',
      preferredTone: 'Calm and structured'
    },
    typicalResponses: {
      whenAskedAboutGoal: 'I need to finish my master\'s thesis by May. Defense is scheduled but I\'m so behind on writing.',
      whenAskedAboutSuccess: 'Defending successfully and graduating on time. Having something I\'m proud of.',
      whenAskedAboutChallenges: 'Everything feels urgent. I freeze up and then waste time worrying instead of working.',
      whenAskedAboutWorkStyle: 'Need clear structure and deadlines broken down. I work well with specific milestones.'
    },
    projects: [
      {
        title: 'Complete master\'s thesis',
        outcome: 'Successfully defend thesis by May 15, 2026',
        completionType: 'milestone'
      }
    ]
  },

  sideHustler: {
    name: 'David Kim',
    role: 'Full-time Developer + Indie App Builder',
    age: 31,
    goal: 'Launch indie app and hit $5k MRR',
    challenges: [
      'Limited time (evenings/weekends only)',
      'Energy depleted after day job',
      'Competing priorities (family, social life)',
      'Slow progress causing doubt'
    ],
    personalityTraits: {
      communicationStyle: 'Enthusiastic but realistic',
      motivationLevel: 'Passionate but time-constrained',
      techSavvy: 'Expert',
      preferredTone: 'Motivational but practical'
    },
    typicalResponses: {
      whenAskedAboutGoal: 'Building an indie app to eventually replace my day job income. Target is $5k monthly recurring revenue.',
      whenAskedAboutSuccess: 'Launching v1, getting first paying customers, hitting $5k MRR so I can go full-time',
      whenAskedAboutChallenges: 'Only have 10-15 hours per week. Making progress is slow and I sometimes question if it\'s worth it.',
      whenAskedAboutWorkStyle: 'Need to maximize limited time. Quick wins to stay motivated. Clear priorities.'
    },
    projects: [
      {
        title: 'Launch indie app',
        outcome: 'Reach $5000 monthly recurring revenue by December 2026',
        completionType: 'milestone'
      }
    ]
  }
};

/**
 * Get random persona for testing
 */
export function getRandomPersona() {
  const personas = Object.values(TEST_PERSONAS);
  return personas[Math.floor(Math.random() * personas.length)];
}

/**
 * Get persona by key
 */
export function getPersona(key) {
  return TEST_PERSONAS[key];
}

export default TEST_PERSONAS;
