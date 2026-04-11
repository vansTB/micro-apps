import { useParams } from 'react-router-dom';

interface UserDetailProps {
  props?: any;
}

const mockUsers: Record<number, { name: string; email: string; role: string }> = {
  1: { name: 'John Doe', email: 'john@example.com', role: 'Admin' },
  2: { name: 'Jane Smith', email: 'jane@example.com', role: 'User' },
  3: { name: 'Bob Johnson', email: 'bob@example.com', role: 'User' },
};

function UserDetail({ props }: UserDetailProps) {
  const { id } = useParams<{ id: string }>();
  const userId = parseInt(id || '0', 10);
  const user = mockUsers[userId];

  if (!user) {
    return <div>User not found</div>;
  }

  return (
    <div>
      <h1>User Detail</h1>
      <p><strong>ID:</strong> {userId}</p>
      <p><strong>Name:</strong> {user.name}</p>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>Role:</strong> {user.role}</p>

      <div style={{ marginTop: '20px' }}>
        <button onClick={() => window.history.back()}>Go Back</button>
      </div>
    </div>
  );
}

export default UserDetail;
