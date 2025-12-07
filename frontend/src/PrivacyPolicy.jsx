import { Link } from 'react-router-dom';

function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link to="/" className="back-link">&larr; Back to RavenLoom</Link>

        <h1>Privacy Policy</h1>
        <p className="effective-date"><strong>Effective Date:</strong> December 7, 2025</p>

        <p>
          RavenLoom ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
          explains how we collect, use, disclose, and safeguard your information when you use our
          team collaboration and AI assistant service (the "Service").
        </p>

        <p>
          By accessing or using the Service, you agree to this Privacy Policy. If you do not agree
          with the terms of this Privacy Policy, please do not access the Service.
        </p>

        <h2>1. Information We Collect</h2>

        <h3>1.1 Information You Provide</h3>
        <ul>
          <li><strong>Account Information:</strong> When you create an account, we collect your email address, display name, and profile picture (if provided through Google authentication).</li>
          <li><strong>User Content:</strong> Messages, files, documents, and other content you submit through the Service.</li>
          <li><strong>Team Information:</strong> Information about teams you create or join, including team names and member associations.</li>
          <li><strong>Communications:</strong> Information you provide when contacting us for support.</li>
        </ul>

        <h3>1.2 Information Collected Automatically</h3>
        <ul>
          <li><strong>Usage Data:</strong> Information about how you interact with the Service, including features used, actions taken, and timestamps.</li>
          <li><strong>Device Information:</strong> Browser type, operating system, device identifiers, and IP address.</li>
          <li><strong>Cookies and Similar Technologies:</strong> We use cookies and similar tracking technologies to maintain your session and preferences.</li>
        </ul>

        <h3>1.3 Third-Party Integrations</h3>
        <p>
          If you connect third-party services (such as Google Drive), we may receive information from
          those services in accordance with their privacy policies and your privacy settings.
        </p>

        <h2>2. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, maintain, and improve the Service</li>
          <li>Process and complete transactions</li>
          <li>Send administrative information, such as updates and security alerts</li>
          <li>Respond to your comments, questions, and requests</li>
          <li>Monitor and analyze usage patterns and trends</li>
          <li>Detect, prevent, and address technical issues and security threats</li>
          <li>Power AI features, including the Raven assistant, to provide intelligent responses based on your team's content</li>
        </ul>

        <h2>3. AI Processing and Data</h2>
        <p>
          The Service includes AI-powered features that process your content to provide intelligent
          assistance. By using these features:
        </p>
        <ul>
          <li>Your messages and content may be sent to third-party AI providers (such as OpenAI) for processing</li>
          <li>We do not use your content to train AI models</li>
          <li>AI-generated responses are based on your team's context and knowledge base</li>
          <li>You can control AI features through your team settings</li>
        </ul>

        <h2>4. Information Sharing and Disclosure</h2>
        <p>We may share your information in the following circumstances:</p>
        <ul>
          <li><strong>With Team Members:</strong> Content you share within a team is visible to other team members.</li>
          <li><strong>Service Providers:</strong> We may share information with third-party vendors who perform services on our behalf (hosting, analytics, AI processing).</li>
          <li><strong>Legal Requirements:</strong> We may disclose information if required by law, court order, or governmental regulation.</li>
          <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your information may be transferred.</li>
          <li><strong>With Your Consent:</strong> We may share information for any other purpose with your consent.</li>
        </ul>

        <h2>5. Data Security</h2>
        <p>
          We implement appropriate technical and organizational measures to protect your information
          against unauthorized access, alteration, disclosure, or destruction. However, no method of
          transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee
          absolute security.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We retain your information for as long as your account is active or as needed to provide
          the Service. We may retain certain information as required by law or for legitimate business
          purposes, such as resolving disputes and enforcing our agreements.
        </p>

        <h2>7. Your Rights and Choices</h2>
        <p>Depending on your location, you may have certain rights regarding your personal information:</p>
        <ul>
          <li><strong>Access:</strong> Request access to your personal information</li>
          <li><strong>Correction:</strong> Request correction of inaccurate information</li>
          <li><strong>Deletion:</strong> Request deletion of your personal information</li>
          <li><strong>Export:</strong> Request a copy of your data in a portable format</li>
          <li><strong>Opt-Out:</strong> Opt out of certain data processing activities</li>
        </ul>
        <p>
          To exercise these rights, please contact us at the information provided below.
        </p>

        <h2>8. Children's Privacy</h2>
        <p>
          The Service is not intended for children under 13 years of age. We do not knowingly collect
          personal information from children under 13. If we learn we have collected information from
          a child under 13, we will delete that information promptly.
        </p>

        <h2>9. International Data Transfers</h2>
        <p>
          Your information may be transferred to and processed in countries other than your country
          of residence. These countries may have data protection laws different from your country.
          By using the Service, you consent to such transfers.
        </p>

        <h2>10. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by
          posting the new Privacy Policy on this page and updating the "Effective Date." Your continued
          use of the Service after any changes constitutes acceptance of the new Privacy Policy.
        </p>

        <h2>11. Contact Us</h2>
        <p>
          If you have questions or concerns about this Privacy Policy or our data practices, please
          contact us at:
        </p>
        <p>
          <strong>RavenLoom</strong><br />
          Email: privacy@ravenloom.ai<br />
          Location: Indiana, United States
        </p>

        <h2>12. Indiana-Specific Provisions</h2>
        <p>
          For residents of Indiana: This Privacy Policy is governed by the laws of the State of Indiana.
          Indiana does not currently have a comprehensive consumer privacy law, but we are committed to
          protecting your privacy in accordance with applicable federal laws and industry best practices.
        </p>

        <div className="legal-footer">
          <Link to="/terms">Terms of Service</Link>
          <span className="separator">|</span>
          <Link to="/">Return to RavenLoom</Link>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;
