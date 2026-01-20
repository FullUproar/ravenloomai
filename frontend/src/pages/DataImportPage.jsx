/**
 * DataImportPage - Import data from external sources (Slack, Teams, etc.)
 *
 * Admin-only page for importing chat history from other platforms.
 * Supports channel mapping, thread import, and duplicate prevention.
 */

import { useState, useRef } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import './DataImportPage.css';

const PARSE_IMPORT_FILE = gql`
  mutation ParseImportFile($teamId: ID!, $source: String!, $fileData: String!) {
    parseImportFile(teamId: $teamId, source: $source, fileData: $fileData) {
      source
      channels {
        id
        name
        messageCount
        threadCount
        memberCount
      }
      userCount
      totalMessages
    }
  }
`;

const EXECUTE_IMPORT = gql`
  mutation ExecuteImport($teamId: ID!, $source: String!, $fileData: String!, $mappings: [ChannelMappingInput!]!) {
    executeImport(teamId: $teamId, source: $source, fileData: $fileData, mappings: $mappings) {
      success
      channelsCreated
      channelsMerged
      messagesImported
      threadsImported
      errors
    }
  }
`;

const GET_TEAM_CHANNELS = gql`
  query GetTeamChannels($teamId: ID!) {
    getTeam(teamId: $teamId) {
      id
      channels {
        id
        name
      }
    }
  }
`;

function DataImportPage({ teamId, onClose }) {
  const [step, setStep] = useState('source'); // source, upload, mapping, importing, results
  const [selectedSource, setSelectedSource] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [channelMappings, setChannelMappings] = useState({});
  const [importResults, setImportResults] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const { data: teamData } = useQuery(GET_TEAM_CHANNELS, {
    variables: { teamId },
    skip: !teamId
  });

  const [parseImportFile, { loading: parsing }] = useMutation(PARSE_IMPORT_FILE);
  const [executeImport, { loading: importing }] = useMutation(EXECUTE_IMPORT);

  const existingChannels = teamData?.getTeam?.channels || [];

  const handleSourceSelect = (source) => {
    if (source !== 'slack') return; // Only Slack is supported for now
    setSelectedSource(source);
    setStep('upload');
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setError('Please select a ZIP file');
      return;
    }

    setFileName(file.name);
    setError(null);

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result.split(',')[1]; // Remove data:...;base64, prefix
      setFileData(base64);

      try {
        const result = await parseImportFile({
          variables: {
            teamId,
            source: selectedSource,
            fileData: base64
          }
        });

        const previewData = result.data.parseImportFile;
        setPreview(previewData);

        // Initialize mappings - default to create new for each channel
        const initialMappings = {};
        previewData.channels.forEach(channel => {
          initialMappings[channel.id] = {
            action: 'create',
            targetChannelId: null,
            newChannelName: channel.name
          };
        });
        setChannelMappings(initialMappings);
        setStep('mapping');
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Create a fake event to reuse handleFileSelect
      handleFileSelect({ target: { files: [file] } });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const updateMapping = (channelId, field, value) => {
    setChannelMappings(prev => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        [field]: value
      }
    }));
  };

  const handleStartImport = async () => {
    setStep('importing');
    setError(null);

    try {
      const mappings = Object.entries(channelMappings).map(([sourceChannelId, mapping]) => ({
        sourceChannelId,
        action: mapping.action,
        targetChannelId: mapping.targetChannelId,
        newChannelName: mapping.newChannelName
      }));

      const result = await executeImport({
        variables: {
          teamId,
          source: selectedSource,
          fileData,
          mappings
        }
      });

      setImportResults(result.data.executeImport);
      setStep('results');
    } catch (err) {
      setError(err.message);
      setStep('mapping'); // Go back to mapping on error
    }
  };

  const getImportableCounts = () => {
    if (!preview) return { channels: 0, messages: 0 };
    const importableChannels = Object.values(channelMappings).filter(m => m.action !== 'skip').length;
    const importableMessages = preview.channels
      .filter(c => channelMappings[c.id]?.action !== 'skip')
      .reduce((sum, c) => sum + c.messageCount, 0);
    return { channels: importableChannels, messages: importableMessages };
  };

  return (
    <div className="data-import-page">
      <div className="import-header">
        <h1>Import Data</h1>
        <button className="close-btn" onClick={onClose}>Close</button>
      </div>

      {error && (
        <div className="import-error">
          {error}
        </div>
      )}

      {/* Step 1: Select Source */}
      {step === 'source' && (
        <div className="import-step">
          <h2>Select Import Source</h2>
          <p className="step-description">Choose where you want to import data from</p>

          <div className="source-cards">
            <button
              className="source-card"
              onClick={() => handleSourceSelect('slack')}
            >
              <span className="source-icon">💬</span>
              <span className="source-name">Slack</span>
              <span className="source-status available">Available</span>
            </button>

            <button className="source-card disabled">
              <span className="source-icon">👥</span>
              <span className="source-name">Microsoft Teams</span>
              <span className="source-status coming-soon">Coming Soon</span>
            </button>

            <button className="source-card disabled">
              <span className="source-icon">🏢</span>
              <span className="source-name">Workplace</span>
              <span className="source-status coming-soon">Coming Soon</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload File */}
      {step === 'upload' && (
        <div className="import-step">
          <h2>Upload {selectedSource === 'slack' ? 'Slack' : ''} Export</h2>
          <p className="step-description">
            Upload your Slack workspace export ZIP file.
            <a href="https://slack.com/help/articles/201658943-Export-your-workspace-data" target="_blank" rel="noopener noreferrer">
              Learn how to export
            </a>
          </p>

          <div
            className={`upload-zone ${parsing ? 'loading' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {parsing ? (
              <>
                <span className="upload-icon">⏳</span>
                <span className="upload-text">Analyzing export...</span>
              </>
            ) : (
              <>
                <span className="upload-icon">📁</span>
                <span className="upload-text">
                  {fileName || 'Drop ZIP file here or click to browse'}
                </span>
                <span className="upload-hint">Supports Slack workspace exports</span>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <button className="back-btn" onClick={() => setStep('source')}>
            Back
          </button>
        </div>
      )}

      {/* Step 3: Channel Mapping */}
      {step === 'mapping' && preview && (
        <div className="import-step">
          <h2>Map Channels</h2>
          <p className="step-description">
            Found {preview.channels.length} channels with {preview.totalMessages.toLocaleString()} messages.
            Choose how to import each channel.
          </p>

          <div className="mapping-table-container">
            <table className="mapping-table">
              <thead>
                <tr>
                  <th>Slack Channel</th>
                  <th>Messages</th>
                  <th>Threads</th>
                  <th>Action</th>
                  <th>Destination</th>
                </tr>
              </thead>
              <tbody>
                {preview.channels.map(channel => (
                  <tr key={channel.id} className={channelMappings[channel.id]?.action === 'skip' ? 'skipped' : ''}>
                    <td className="channel-name">#{channel.name}</td>
                    <td>{channel.messageCount.toLocaleString()}</td>
                    <td>{channel.threadCount}</td>
                    <td>
                      <select
                        value={channelMappings[channel.id]?.action || 'create'}
                        onChange={(e) => updateMapping(channel.id, 'action', e.target.value)}
                      >
                        <option value="create">Create New</option>
                        <option value="merge">Merge Into Existing</option>
                        <option value="skip">Skip</option>
                      </select>
                    </td>
                    <td>
                      {channelMappings[channel.id]?.action === 'create' && (
                        <input
                          type="text"
                          placeholder="Channel name"
                          value={channelMappings[channel.id]?.newChannelName || ''}
                          onChange={(e) => updateMapping(channel.id, 'newChannelName', e.target.value)}
                        />
                      )}
                      {channelMappings[channel.id]?.action === 'merge' && (
                        <select
                          value={channelMappings[channel.id]?.targetChannelId || ''}
                          onChange={(e) => updateMapping(channel.id, 'targetChannelId', e.target.value)}
                        >
                          <option value="">Select channel...</option>
                          {existingChannels.map(ch => (
                            <option key={ch.id} value={ch.id}>#{ch.name}</option>
                          ))}
                        </select>
                      )}
                      {channelMappings[channel.id]?.action === 'skip' && (
                        <span className="skip-label">Won't be imported</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="import-summary">
            <p>
              Will import <strong>{getImportableCounts().channels}</strong> channels
              with <strong>{getImportableCounts().messages.toLocaleString()}</strong> messages
            </p>
          </div>

          <div className="import-actions">
            <button className="back-btn" onClick={() => setStep('upload')}>
              Back
            </button>
            <button
              className="import-btn"
              onClick={handleStartImport}
              disabled={getImportableCounts().channels === 0}
            >
              Start Import
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="import-step">
          <h2>Importing...</h2>
          <div className="importing-indicator">
            <div className="spinner"></div>
            <p>Importing channels and messages. This may take a few minutes.</p>
          </div>
        </div>
      )}

      {/* Step 5: Results */}
      {step === 'results' && importResults && (
        <div className="import-step">
          <h2>{importResults.success ? 'Import Complete' : 'Import Completed with Errors'}</h2>

          <div className="results-summary">
            <div className="result-stat">
              <span className="stat-value">{importResults.channelsCreated}</span>
              <span className="stat-label">Channels Created</span>
            </div>
            <div className="result-stat">
              <span className="stat-value">{importResults.channelsMerged}</span>
              <span className="stat-label">Channels Merged</span>
            </div>
            <div className="result-stat">
              <span className="stat-value">{importResults.messagesImported.toLocaleString()}</span>
              <span className="stat-label">Messages Imported</span>
            </div>
            <div className="result-stat">
              <span className="stat-value">{importResults.threadsImported}</span>
              <span className="stat-label">Threads Created</span>
            </div>
          </div>

          {importResults.errors && importResults.errors.length > 0 && (
            <div className="import-errors">
              <h3>Errors</h3>
              <ul>
                {importResults.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <button className="close-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export default DataImportPage;
