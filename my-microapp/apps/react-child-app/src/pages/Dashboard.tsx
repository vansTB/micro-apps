import { Link } from 'react-router-dom';

interface DashboardProps {
  props?: any;
}

function Dashboard({ props }: DashboardProps) {
  const handleSendMessage = () => {
    if (props?.setGlobalState) {
      props.setGlobalState({
        message: 'Message from React Child App',
        timestamp: Date.now(),
      });
      console.log('[react-child-app] Sent message to main app');
    }
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome to React Child App</p>

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Communication Demo</h3>
        <p><strong>Powered by QianKun:</strong> {(window as any).__POWERED_BY_QIANKUN__ ? 'Yes' : 'No'}</p>

        {props?.setGlobalState && (
          <button
            onClick={handleSendMessage}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Send Message to Main App
          </button>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
