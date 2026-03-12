const pool = require('../config/database');

const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isRead } = req.query;

    let query = 'SELECT * FROM messages WHERE user_id = $1';
    const params = [userId];

    if (isRead !== undefined) {
      query += ' AND is_read = $2';
      params.push(isRead === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
  }
};

const createMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message are required' });
    }

    const result = await pool.query(
      'INSERT INTO messages (user_id, subject, message) VALUES ($1, $2, $3) RETURNING *',
      [userId, subject, message]
    );

    res.status(201).json({ message: result.rows[0] });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ message: 'Failed to create message', error: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'UPDATE messages SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.json({ message: result.rows[0] });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Failed to mark message as read', error: error.message });
  }
};

module.exports = { getMessages, createMessage, markAsRead };

