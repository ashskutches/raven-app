'use client';
import { apiFetch } from '../lib/api';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Target, Heart, Users, Lightbulb, Star, ChevronDown, ChevronUp } from 'lucide-react';



interface Fact { key: string; value: string; confidence?: number; last_updated_at?: string; }
interface LibraryEntry { id: string; title: string; type: string; content: string; summary?: string; tags?: string[]; confidence?: number; updated_at: string; }
interface Goal { id: string; title: string; description?: string; status: string; progress: number; why?: string; target_date?: string; }

const SECTION_CONFIG = {
  facts:       { icon: <User size={15} />,        label: 'Key Facts',       color: '#a78bfa', desc: 'Core facts Raven knows about you' },
  goals:       { icon: <Target size={15} />,      label: 'Active Goals',    color: '#60a5fa', desc: 'What you\'re working toward' },
  user_fact:   { icon: <Heart size={15} />,       label: 'About Ash',       color: '#f472b6', desc: 'Personal context Raven has learned' },
  insight:     { icon: <Lightbulb size={15} />,   label: 'Raven\'s Insights', color: '#fbbf24', desc: 'Patterns and observations Raven has noticed' },
  family:      { icon: <Users size={15} />,       label: 'People',          color: '#34d399', desc: 'Important people in your life' },
  goal_context:{ icon: <Star size={15} />,        label: 'Goal Context',    color: '#fb923c', desc: 'Background on your goals and motivations' },
};

export default function AshProfileScreen() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [libraryByType, setLibraryByType] = useState<Record<string, LibraryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ facts: true, goals: true, user_fact: true });

  const fetchAll = useCallback(async () => {
    try {
      const [factsRes, goalsRes, libraryRes] = await Promise.all([
        apiFetch(`/library/facts`),
        apiFetch(`/goals?status=active,in_progress`),
        apiFetch(`/library?types=user_fact,insight,family,goal_context&limit=50`),
      ]);

      if (factsRes.ok) setFacts(await factsRes.json() as Fact[]);
      if (goalsRes.ok) setGoals(await goalsRes.json() as Goal[]);

      if (libraryRes.ok) {
        const entries = await libraryRes.json() as LibraryEntry[];
        const byType: Record<string, LibraryEntry[]> = {};
        for (const e of entries) {
          if (!byType[e.type]) byType[e.type] = [];
          byType[e.type].push(e);
        }
        setLibraryByType(byType);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) return <div className="profile-screen"><div className="profile-empty">Loading Ash&apos;s profile...</div></div>;

  const hasAnything = facts.length > 0 || goals.length > 0 || Object.keys(libraryByType).length > 0;

  if (!hasAnything) return (
    <div className="profile-screen">
      <div className="profile-empty">
        <User size={36} opacity={0.3} />
        <p>Raven hasn&apos;t learned much about you yet.</p>
        <p style={{ fontSize: 12, opacity: 0.5 }}>Chat with her — she&apos;ll build your profile over time.</p>
      </div>
    </div>
  );

  return (
    <div className="profile-screen">
      <div className="profile-banner">
        <div className="profile-avatar">🧠</div>
        <div>
          <div className="profile-name">Ash</div>
          <div className="profile-subtitle">
            {facts.length} facts · {goals.length} active goals · {Object.values(libraryByType).flat().length} library entries
          </div>
        </div>
      </div>

      {/* Key Facts */}
      {facts.length > 0 && (
        <ProfileSection
          sectionKey="facts"
          expanded={expanded.facts}
          onToggle={() => toggle('facts')}
          count={facts.length}
        >
          <div className="profile-facts-grid">
            {facts.map(f => (
              <div key={f.key} className="profile-fact-card">
                <div className="profile-fact-key">{f.key.replace(/_/g, ' ')}</div>
                <div className="profile-fact-value">{f.value}</div>
                {f.last_updated_at && (
                  <div className="profile-fact-date">{new Date(f.last_updated_at).toLocaleDateString()}</div>
                )}
              </div>
            ))}
          </div>
        </ProfileSection>
      )}

      {/* Active Goals */}
      {goals.length > 0 && (
        <ProfileSection
          sectionKey="goals"
          expanded={expanded.goals}
          onToggle={() => toggle('goals')}
          count={goals.length}
        >
          <div className="profile-goals-list">
            {goals.map(g => (
              <div key={g.id} className="profile-goal">
                <div className="profile-goal-header">
                  <span className="profile-goal-title">{g.title}</span>
                  <span className="profile-goal-progress">{g.progress}%</span>
                </div>
                <div className="profile-goal-bar">
                  <div className="profile-goal-fill" style={{ width: `${g.progress}%` }} />
                </div>
                {g.why && <div className="profile-goal-why">Why: {g.why}</div>}
                {g.description && <div className="profile-goal-desc">{g.description}</div>}
              </div>
            ))}
          </div>
        </ProfileSection>
      )}

      {/* Library entries by type */}
      {(['user_fact', 'insight', 'family', 'goal_context'] as const).map(type => {
        const entries = libraryByType[type];
        if (!entries?.length) return null;
        return (
          <ProfileSection
            key={type}
            sectionKey={type}
            expanded={expanded[type] ?? false}
            onToggle={() => toggle(type)}
            count={entries.length}
          >
            <div className="profile-entries-list">
              <AnimatePresence>
                {entries.map(e => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="profile-entry"
                  >
                    <div className="profile-entry-title">{e.title}</div>
                    <div className="profile-entry-content">{e.summary || e.content.slice(0, 200)}</div>
                    {e.tags && e.tags.length > 0 && (
                      <div className="profile-entry-tags">
                        {e.tags.slice(0, 4).map(t => <span key={t} className="profile-entry-tag">{t}</span>)}
                      </div>
                    )}
                    <div className="profile-entry-meta">
                      Updated {new Date(e.updated_at).toLocaleDateString()}
                      {e.confidence != null && ` · ${Math.round(e.confidence * 100)}% confidence`}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ProfileSection>
        );
      })}
    </div>
  );
}

function ProfileSection({ sectionKey, expanded, onToggle, count, children }: {
  sectionKey: string;
  expanded: boolean;
  onToggle: () => void;
  count: number;
  children: React.ReactNode;
}) {
  const cfg = SECTION_CONFIG[sectionKey as keyof typeof SECTION_CONFIG] ?? SECTION_CONFIG.facts;
  return (
    <div className="profile-section">
      <button className="profile-section-header" onClick={onToggle}>
        <span className="profile-section-icon" style={{ color: cfg.color }}>{cfg.icon}</span>
        <div className="profile-section-info">
          <span className="profile-section-title">{cfg.label}</span>
          <span className="profile-section-desc">{cfg.desc}</span>
        </div>
        <span className="profile-section-count">{count}</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="profile-section-body"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
