import { Link } from 'react-router-dom';

const mockUsers = [
  { id: 1, name: 'John Doe', email: 'john@example.com' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com' },
];

function UserList() {
  return (
    <div>
      <h1>User List</h1>
      <ul>
        {mockUsers.map((user) => (
          <li key={user.id} style={{ marginBottom: '10px' }}>
            <Link to={`/user-detail/${user.id}`}>
              {user.name} - {user.email}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default UserList;
