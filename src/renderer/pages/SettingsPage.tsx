import React, { useState } from 'react'

type Section = 'general' | 'model' | 'privacy' | 'calendar'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('general')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#f0f0f0]">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-[13px] text-[#888] hover:text-[#1a1a1a] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Settings
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left nav */}
        <div className="w-[180px] flex-shrink-0 border-r border-[#f0f0f0] py-4 px-3 space-y-0.5">
          <SettingsNavItem label="General" active={section === 'general'} onClick={() => setSection('general')} />
          <SettingsNavItem label="AI Model" active={section === 'model'} onClick={() => setSection('model')} />
          <SettingsNavItem label="Privacy" active={section === 'privacy'} onClick={() => setSection('privacy')} />
          <SettingsNavItem label="Calendar" active={section === 'calendar'} onClick={() => setSection('calendar')} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-8 px-10">
          {section === 'general' && <GeneralSection />}
          {section === 'model' && <ModelSection />}
          {section === 'privacy' && <PrivacySection />}
          {section === 'calendar' && <CalendarSection />}
        </div>
      </div>
    </div>
  )
}

function SettingsNavItem({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
        active ? 'bg-[#f4f4f4] text-[#1a1a1a] font-medium' : 'text-[#666] hover:bg-[#f7f7f5]'
      }`}
    >
      {label}
    </button>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[18px] font-semibold text-[#1a1a1a]">{title}</h2>
      {subtitle && <p className="text-[13px] text-[#999] mt-1">{subtitle}</p>}
    </div>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-[#f7f7f5] last:border-0 gap-8">
      <div className="min-w-0">
        <p className="text-[14px] text-[#1a1a1a] font-medium">{label}</p>
        {description && <p className="text-[12px] text-[#999] mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  )
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${enabled ? 'bg-[#1a1a1a]' : 'bg-[#ddd]'}`}>
      <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
  )
}

function GeneralSection() {
  return (
    <div>
      <SectionTitle title="General" />
      <Row
        label="App name"
        description="Displayed in the menu bar and dock."
      >
        <span className="text-[13px] text-[#999]">Arc</span>
      </Row>
      <Row
        label="Launch at login"
        description="Start Arc automatically when you log into your Mac."
      >
        <Toggle enabled={false} />
      </Row>
      <Row
        label="Show in menu bar"
        description="Keep Arc accessible from the menu bar at all times."
      >
        <Toggle enabled={true} />
      </Row>
    </div>
  )
}

function ModelSection() {
  return (
    <div>
      <SectionTitle
        title="AI Model"
        subtitle="Arc selects the best model for your Mac automatically."
      />
      <Row
        label="Current model"
        description="Chosen based on your device's chip and memory."
      >
        <div className="text-right">
          <p className="text-[13px] text-[#1a1a1a] font-medium">Qwen 2.5 7B</p>
          <p className="text-[11px] text-[#999] mt-0.5">Recommended for your Mac</p>
        </div>
      </Row>

      <div className="mt-6">
        <p className="text-[12px] font-semibold text-[#aaa] uppercase tracking-widest mb-3">Advanced</p>
        <div className="border border-[#f0f0f0] rounded-xl overflow-hidden">
          {[
            { name: 'Qwen 2.5 7B', size: '4.7 GB', note: 'Recommended for M1/M2', active: true },
            { name: 'Llama 3.1 8B', size: '4.9 GB', note: 'Higher quality, needs 16GB+ RAM', active: false },
            { name: 'Qwen 2.5 3B', size: '2.1 GB', note: 'Fastest, works on any Mac', active: false },
          ].map((m, i) => (
            <div
              key={m.name}
              className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-[#f7f7f5]' : ''} ${m.active ? 'bg-[#fafafa]' : ''}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${m.active ? 'border-[#1a1a1a]' : 'border-[#ddd]'}`}>
                {m.active && <div className="w-2 h-2 rounded-full bg-[#1a1a1a]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#1a1a1a] font-medium">{m.name}</p>
                <p className="text-[11px] text-[#aaa]">{m.note}</p>
              </div>
              <span className="text-[12px] text-[#bbb]">{m.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PrivacySection() {
  return (
    <div>
      <SectionTitle title="Privacy" subtitle="Arc is designed from the ground up to keep your data private." />

      <div className="bg-[#f7f7f5] rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#1a1a1a]">All data stays on your Mac</p>
            <p className="text-[12px] text-[#666] mt-1 leading-relaxed">
              Your documents, conversations, and meeting recordings never leave this device. Arc works without an internet connection.
            </p>
          </div>
        </div>
      </div>

      <Row label="AI model" description="Runs locally on your Mac. No cloud API calls ever made." >
        <span className="text-[12px] text-emerald-600 font-medium">On-device</span>
      </Row>
      <Row label="Document vault" description="Stored in ~/Library/Application Support/Arc/ on your Mac." >
        <span className="text-[12px] text-emerald-600 font-medium">Local only</span>
      </Row>
      <Row label="Meeting recordings" description="Transcribed locally using Whisper. Audio never uploaded." >
        <span className="text-[12px] text-emerald-600 font-medium">Local only</span>
      </Row>
      <Row label="Conversations" description="Saved as JSON files on your Mac. Never synced to a server." >
        <span className="text-[12px] text-emerald-600 font-medium">Local only</span>
      </Row>
    </div>
  )
}

function CalendarSection() {
  return (
    <div>
      <SectionTitle
        title="Calendar"
        subtitle="Connect your calendar to see upcoming meetings in Arc. Optional — Arc works without it."
      />
      <Row
        label="Google Calendar"
        description="View upcoming meetings and auto-start recording when a call begins."
      >
        <button className="px-4 py-2 rounded-lg border border-[#e0e0e0] text-[12px] text-[#555] hover:border-[#ccc] transition-colors">
          Connect
        </button>
      </Row>
      <Row
        label="Outlook / Office 365"
        description="Connect your Microsoft calendar for meeting awareness."
      >
        <button className="px-4 py-2 rounded-lg border border-[#e0e0e0] text-[12px] text-[#555] hover:border-[#ccc] transition-colors">
          Connect
        </button>
      </Row>

      <div className="mt-6 p-4 bg-[#f7f7f5] rounded-xl">
        <p className="text-[12px] text-[#999] leading-relaxed">
          Calendar access is read-only. Arc only reads event titles and times to display upcoming meetings. No calendar data is stored or transmitted.
        </p>
      </div>
    </div>
  )
}
