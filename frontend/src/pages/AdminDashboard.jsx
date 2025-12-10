/**
 * AdminDashboard - Super Admin Site Management
 *
 * Hidden page only accessible to super_admin users.
 * Shows all users, teams, and provides management functionality.
 */

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import './AdminDashboard.css';

const GET_ADMIN_DATA = gql`
  query GetAdminData {
    getAllUsers {
      id
      email
      displayName
      siteRole
      isSiteAdmin
      createdAt
    }
    getAllTeams {
      id
      name
      slug
      createdAt
    }
    getAccessCodes {
      id
      code
      description
      maxUses
      usesRemaining
      isActive
      createdAt
    }
    getSiteInvites {
      id
      email
      status
      createdAt
    }
  }
`;

const UPDATE_USER_ROLE = gql`
  mutation UpdateUserSiteRole($userId: ID!, $role: String!) {
    updateUserSiteRole(userId: $userId, role: $role) {
      id
      email
      siteRole
    }
  }
`;

const DELETE_USER = gql`
  mutation DeleteUser($userId: ID!) {
    deleteUser(userId: $userId)
  }
`;

const DELETE_TEAM = gql`
  mutation DeleteTeam($teamId: ID!) {
    deleteTeam(teamId: $teamId)
  }
`;

const CREATE_ACCESS_CODE = gql`
  mutation CreateAccessCode($input: CreateAccessCodeInput) {
    createAccessCode(input: $input) {
      id
      code
      description
      maxUses
      usesRemaining
      isActive
    }
  }
`;

const CREATE_SITE_INVITE = gql`
  mutation CreateSiteInvite($email: String!) {
    createSiteInvite(email: $email) {
      id
      email
      status
    }
  }
`;

function AdminDashboard({ onClose }) {
  const [activeTab, setActiveTab] = useState('users');
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newCodeDescription, setNewCodeDescription] = useState('');
  const [newCodeMaxUses, setNewCodeMaxUses] = useState(1);

  const { data, loading, error, refetch } = useQuery(GET_ADMIN_DATA);
  const [updateUserRole] = useMutation(UPDATE_USER_ROLE);
  const [deleteUser] = useMutation(DELETE_USER);
  const [deleteTeam] = useMutation(DELETE_TEAM);
  const [createAccessCode] = useMutation(CREATE_ACCESS_CODE);
  const [createSiteInvite] = useMutation(CREATE_SITE_INVITE);

  const handleRoleChange = async (userId, newRole) => {
    if (!confirm(`Change role to ${newRole}?`)) return;
    try {
      await updateUserRole({ variables: { userId, role: newRole } });
      refetch();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId, email) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await deleteUser({ variables: { userId } });
      refetch();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteTeam = async (teamId, name) => {
    if (!confirm(`Delete team "${name}"? This will delete all associated data and cannot be undone.`)) return;
    try {
      await deleteTeam({ variables: { teamId } });
      refetch();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCreateAccessCode = async () => {
    try {
      const result = await createAccessCode({
        variables: {
          input: {
            description: newCodeDescription || null,
            maxUses: parseInt(newCodeMaxUses) || 1
          }
        }
      });
      alert(`Access code created: ${result.data.createAccessCode.code}`);
      setNewCodeDescription('');
      setNewCodeMaxUses(1);
      refetch();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCreateInvite = async () => {
    if (!newInviteEmail) return;
    try {
      await createSiteInvite({ variables: { email: newInviteEmail } });
      setNewInviteEmail('');
      refetch();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="admin-dashboard"><p>Loading...</p></div>;
  if (error) return <div className="admin-dashboard"><p>Error: {error.message}</p></div>;

  const { getAllUsers: users, getAllTeams: teams, getAccessCodes: codes, getSiteInvites: invites } = data;

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Site Administration</h1>
        <button className="close-btn" onClick={onClose}>Close</button>
      </div>

      <div className="admin-tabs">
        <button
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          Users ({users.length})
        </button>
        <button
          className={activeTab === 'teams' ? 'active' : ''}
          onClick={() => setActiveTab('teams')}
        >
          Teams ({teams.length})
        </button>
        <button
          className={activeTab === 'invites' ? 'active' : ''}
          onClick={() => setActiveTab('invites')}
        >
          Invites
        </button>
        <button
          className={activeTab === 'codes' ? 'active' : ''}
          onClick={() => setActiveTab('codes')}
        >
          Access Codes
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'users' && (
          <div className="admin-section">
            <h2>All Users</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Display Name</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.displayName || '-'}</td>
                    <td>
                      <select
                        value={user.siteRole || 'user'}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className={`role-${user.siteRole || 'user'}`}
                      >
                        <option value="user">User</option>
                        <option value="team_creator">Team Creator</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteUser(user.id, user.email)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="admin-section">
            <h2>All Teams</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{team.slug}</td>
                    <td>{new Date(team.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'invites' && (
          <div className="admin-section">
            <h2>Site Invites</h2>
            <div className="create-form">
              <input
                type="email"
                placeholder="Email to invite"
                value={newInviteEmail}
                onChange={(e) => setNewInviteEmail(e.target.value)}
              />
              <button onClick={handleCreateInvite}>Send Invite</button>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(invite => (
                  <tr key={invite.id}>
                    <td>{invite.email}</td>
                    <td className={`status-${invite.status}`}>{invite.status}</td>
                    <td>{new Date(invite.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'codes' && (
          <div className="admin-section">
            <h2>Access Codes</h2>
            <div className="create-form">
              <input
                type="text"
                placeholder="Description (optional)"
                value={newCodeDescription}
                onChange={(e) => setNewCodeDescription(e.target.value)}
              />
              <input
                type="number"
                placeholder="Max uses"
                value={newCodeMaxUses}
                onChange={(e) => setNewCodeMaxUses(e.target.value)}
                min="1"
                style={{ width: '100px' }}
              />
              <button onClick={handleCreateAccessCode}>Create Code</button>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Uses</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {codes.map(code => (
                  <tr key={code.id}>
                    <td className="code-cell">{code.code}</td>
                    <td>{code.description || '-'}</td>
                    <td>{code.usesRemaining} / {code.maxUses}</td>
                    <td className={code.isActive ? 'status-active' : 'status-inactive'}>
                      {code.isActive ? 'Active' : 'Inactive'}
                    </td>
                    <td>{new Date(code.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
