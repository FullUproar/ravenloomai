import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function HelpPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'goals', label: 'Goals' },
    { id: 'projects', label: 'Projects' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'chat', label: 'Chat & @raven' },
    { id: 'ask', label: 'Ask the Team' }
  ];

  return (
    <div className="help-page">
      <header className="help-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>Help & Guide</h1>
      </header>

      <div className="help-layout">
        {/* Sidebar Navigation */}
        <nav className="help-nav">
          {sections.map(section => (
            <button
              key={section.id}
              className={`help-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="help-content">
          {activeSection === 'overview' && (
            <section>
              <h2>Welcome to RavenLoom</h2>
              <p>
                RavenLoom is your team's knowledge hub - a place where conversations, tasks,
                and institutional knowledge come together. Think of it as Slack meets Asana
                with an AI assistant that never forgets.
              </p>

              <h3>Core Concepts</h3>
              <div className="concept-grid">
                <div className="concept-card">
                  <span className="concept-icon">🎯</span>
                  <h4>Goals</h4>
                  <p>Strategic objectives that persist over time. Goals are thematic - they answer "why" you're doing things.</p>
                </div>
                <div className="concept-card">
                  <span className="concept-icon">📁</span>
                  <h4>Projects</h4>
                  <p>Time-bound bodies of work. Projects are containers for related tasks with deadlines.</p>
                </div>
                <div className="concept-card">
                  <span className="concept-icon">✓</span>
                  <h4>Tasks</h4>
                  <p>Individual work items. Tasks can be assigned, prioritized, and tracked to completion.</p>
                </div>
                <div className="concept-card">
                  <span className="concept-icon">💬</span>
                  <h4>Channels</h4>
                  <p>Chat spaces for team communication. Use @raven to interact with AI and capture knowledge.</p>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'goals' && (
            <section>
              <h2>Goals</h2>
              <p>
                Goals represent your team's strategic objectives. Unlike projects, goals are
                <strong> ongoing and thematic</strong> rather than time-bound deliverables.
              </p>

              <h3>How Goals Work</h3>
              <div className="info-box">
                <h4>Goals are Associative, Not Hierarchical</h4>
                <p>
                  Goals don't "own" projects or tasks. Instead, they can be <strong>linked</strong> to
                  any number of projects and tasks. This allows work to serve multiple strategic
                  objectives simultaneously.
                </p>
              </div>

              <h3>Example</h3>
              <div className="example-box">
                <p><strong>Goal:</strong> "Improve Customer Retention"</p>
                <p>This goal might be linked to:</p>
                <ul>
                  <li>Tasks in the "Support System Upgrade" project</li>
                  <li>Tasks in the "Onboarding Redesign" project</li>
                  <li>Standalone tasks like "Analyze churn data"</li>
                </ul>
                <p>Progress is calculated from all linked tasks, giving you a cross-project view.</p>
              </div>

              <h3>Goal Statuses</h3>
              <ul className="status-list">
                <li><span className="status-badge active">Active</span> Currently being worked on</li>
                <li><span className="status-badge achieved">Achieved</span> Successfully completed</li>
                <li><span className="status-badge paused">Paused</span> Temporarily on hold</li>
                <li><span className="status-badge abandoned">Abandoned</span> No longer relevant</li>
              </ul>
            </section>
          )}

          {activeSection === 'projects' && (
            <section>
              <h2>Projects</h2>
              <p>
                Projects are <strong>time-bound containers</strong> for related work. They have
                due dates, owners, and contain tasks that contribute to a deliverable.
              </p>

              <h3>Project Settings</h3>
              <div className="info-box">
                <h4>Goals Inheritance</h4>
                <p>
                  By default, <strong>tasks inherit goals from their project</strong>. This means
                  when you link a goal to a project, all tasks in that project automatically
                  contribute to that goal.
                </p>
                <p>
                  You can turn this off per-project if you want more granular control. When
                  inheritance is off, you must link goals directly to individual tasks.
                </p>
              </div>

              <h3>Linking Goals to Projects</h3>
              <p>Projects can be linked to multiple goals. This is useful when a project serves several strategic objectives.</p>

              <div className="example-box">
                <p><strong>Project:</strong> "Website Redesign"</p>
                <p>Linked goals:</p>
                <ul>
                  <li>"Improve Brand Perception" (primary)</li>
                  <li>"Increase Conversion Rate" (secondary)</li>
                </ul>
              </div>
            </section>
          )}

          {activeSection === 'tasks' && (
            <section>
              <h2>Tasks</h2>
              <p>
                Tasks are individual work items - the atomic units of work in RavenLoom.
              </p>

              <h3>Task Properties</h3>
              <ul className="property-list">
                <li><strong>Status:</strong> To Do → In Progress → Done</li>
                <li><strong>Priority:</strong> Low, Medium, High, Urgent</li>
                <li><strong>Assignee:</strong> Who's responsible</li>
                <li><strong>Due Date:</strong> When it needs to be done</li>
                <li><strong>Project:</strong> Which project it belongs to (optional)</li>
                <li><strong>Goals:</strong> Which goals it contributes to</li>
              </ul>

              <h3>Goal Linking</h3>
              <div className="info-box">
                <h4>Inherited vs Direct Goals</h4>
                <p>Tasks can have two types of goal links:</p>
                <ul>
                  <li>
                    <span className="goal-tag inherited">Inherited ↓</span>
                    Automatically linked through the parent project
                  </li>
                  <li>
                    <span className="goal-tag direct">Direct</span>
                    Explicitly linked to the task (for cross-cutting concerns)
                  </li>
                </ul>
              </div>

              <div className="example-box">
                <p><strong>Example:</strong> A task in the "Q1 Marketing" project</p>
                <ul>
                  <li><span className="goal-tag inherited">Brand Awareness ↓</span> (from project)</li>
                  <li><span className="goal-tag direct">Product Launch</span> (direct link)</li>
                </ul>
                <p>This task contributes to both goals.</p>
              </div>

              <h3>Standalone Tasks</h3>
              <p>
                Tasks don't have to belong to a project. Standalone tasks can still be linked
                directly to goals - perfect for quick wins or one-off items.
              </p>
            </section>
          )}

          {activeSection === 'chat' && (
            <section>
              <h2>Chat & @raven Commands</h2>
              <p>
                Channels are where your team communicates. Use <code>@raven</code> to interact
                with the AI assistant and capture knowledge.
              </p>

              <h3>@raven Commands</h3>
              <div className="command-list">
                <div className="command-item">
                  <code>@raven remember [fact]</code>
                  <p>Save important information to the knowledge base</p>
                  <span className="example">@raven remember our API rate limit is 1000 requests/minute</span>
                </div>

                <div className="command-item">
                  <code>@raven remind [when] [message]</code>
                  <p>Set a reminder for yourself or the team</p>
                  <span className="example">@raven remind tomorrow review Q3 metrics</span>
                </div>

                <div className="command-item">
                  <code>@raven task [title]</code>
                  <p>Create a new task from the conversation</p>
                  <span className="example">@raven task Fix login bug on mobile</span>
                </div>

                <div className="command-item">
                  <code>@raven decision [what]</code>
                  <p>Record a team decision with context</p>
                  <span className="example">@raven decision We'll use PostgreSQL for the new service</span>
                </div>

                <div className="command-item">
                  <code>@raven [question]</code>
                  <p>Ask a question and get an AI-powered answer from your knowledge base</p>
                  <span className="example">@raven what's our refund policy?</span>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'ask' && (
            <section>
              <h2>Ask the Team</h2>
              <p>
                The "Ask" feature lets you query your team's collective knowledge. It searches
                through facts, decisions, and conversations to find answers.
              </p>

              <h3>How It Works</h3>
              <ol className="numbered-list">
                <li>Type your question in natural language</li>
                <li>RavenLoom searches your knowledge base</li>
                <li>AI synthesizes an answer from relevant facts and decisions</li>
                <li>Sources are shown so you can verify and dive deeper</li>
              </ol>

              <h3>Tips for Better Answers</h3>
              <ul>
                <li>Be specific: "What's the process for handling refunds?" vs "refunds"</li>
                <li>Reference entities: "What do we know about Acme Corp?"</li>
                <li>Ask about decisions: "Why did we choose React for the frontend?"</li>
              </ul>

              <div className="info-box">
                <h4>Building Your Knowledge Base</h4>
                <p>
                  The more your team uses <code>@raven remember</code> and <code>@raven decision</code>,
                  the better Ask becomes. Make it a habit to capture important information!
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default HelpPage;
