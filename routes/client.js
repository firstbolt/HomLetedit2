const express = require('express');
const router = express.Router();
const { isAuthenticated, isClient } = require('../middleware/auth');
const Property = require('../models/Property');
const User = require('../models/User');
const Rating = require('../models/Rating');
const Contact = require('../models/Contact');

// Client dashboard
router.get('/dashboard', isAuthenticated, isClient, async (req, res) => {
  try {
    const { state, area, minPrice, maxPrice, type } = req.query;
    const filter = { status: 'active' };

    if (state) filter['location.state'] = new RegExp(state, 'i');
    if (area) filter['location.area'] = new RegExp(area, 'i');
    if (minPrice) filter.price = { $gte: parseInt(minPrice) };
    if (maxPrice) filter.price = { ...filter.price, $lte: parseInt(maxPrice) };
    if (type) filter.propertyType = type;

    const properties = await Property.find(filter)
      .populate('agent', 'fullName phone')
      .sort({ createdAt: -1 });

    const client = await User.findById(req.session.user._id)
      .populate('paymentHistory.propertyId', 'title')
      .populate('paymentHistory.agentId', 'fullName');

    res.render('client/dashboard', {
      title: 'Client Dashboard',
      properties,
      client,
      filters: { state, area, minPrice, maxPrice, type }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/');
  }
});

// Contact agent
router.post('/contact-agent', isAuthenticated, isClient, async (req, res) => {
  try {
    const { agentId, propertyId } = req.body;
    
    // Get client, agent, and property details
    const client = await User.findById(req.session.user._id);
    const agent = await User.findById(agentId);
    const property = await Property.findById(propertyId);
    
    if (!agent || !property) {
      return res.status(404).json({ success: false, error: 'Agent or property not found' });
    }
    
    // Check if contact already exists
    const existingContact = await Contact.findOne({
      client: client._id,
      agent: agent._id,
      property: property._id
    });
    
    if (existingContact) {
      return res.json({ success: false, error: 'You have already contacted this agent for this property' });
    }
    
    // Create new contact record
    const contact = new Contact({
      client: client._id,
      agent: agent._id,
      property: property._id,
      clientName: client.fullName,
      clientPhone: client.phone,
      agentName: agent.fullName,
      agentPhone: agent.phone,
      propertyTitle: property.title
    });
    
    await contact.save();
    
    res.json({ 
      success: true, 
      message: 'Contact request sent successfully!',
      agentPhone: agent.phone 
    });
  } catch (error) {
    console.error('Contact agent error:', error);
    res.status(500).json({ success: false, error: 'Failed to send contact request' });
  }
});

// Rate agent page
router.get('/rate/:agentId', isAuthenticated, isClient, async (req, res) => {
  try {
    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      req.flash('error_msg', 'Agent not found');
      return res.redirect('/client/dashboard');
    }

    // Check if client has contacted this agent
    const hasContacted = await Contact.findOne({
      client: req.session.user._id,
      agent: agent._id
    });
    
    if (!hasContacted) {
      req.flash('error_msg', 'You can only rate agents you have contacted');
      return res.redirect('/client/dashboard');
    }

    // Get properties by this agent that the client has accessed
    const properties = await Property.find({ agent: agent._id });

    res.render('client/rate-agent', {
      title: 'Rate Agent',
      agent,
      properties
    });
  } catch (error) {
    console.error('Rate agent error:', error);
    req.flash('error_msg', 'Error loading rating page');
    res.redirect('/client/dashboard');
  }
});

// Submit rating
router.post('/rate/:agentId', isAuthenticated, isClient, async (req, res) => {
  try {
    const { rating, comment, propertyId } = req.body;
    const agentId = req.params.agentId;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      req.flash('error_msg', 'Please provide a valid rating (1-5)');
      return res.redirect(`/client/rate/${agentId}`);
    }

    // Check if client has already rated this agent for this property
    const existingRating = await Rating.findOne({
      client: req.session.user._id,
      agent: agentId,
      property: propertyId
    });

    if (existingRating) {
      req.flash('error_msg', 'You have already rated this agent for this property');
      return res.redirect('/client/dashboard');
    }

    // Create new rating
    const newRating = new Rating({
      client: req.session.user._id,
      agent: agentId,
      property: propertyId,
      rating: parseInt(rating),
      comment
    });

    await newRating.save();

    // Update agent's average rating
    const agent = await User.findById(agentId);
    const allRatings = await Rating.find({ agent: agentId });
    const totalRating = allRatings.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = totalRating / allRatings.length;

    agent.rating = avgRating;
    agent.totalRatings = allRatings.length;
    await agent.save();

    req.flash('success_msg', 'Rating submitted successfully!');
    res.redirect('/client/dashboard');
  } catch (error) {
    console.error('Submit rating error:', error);
    req.flash('error_msg', 'Error submitting rating');
    res.redirect('/client/dashboard');
  }
});

module.exports = router;