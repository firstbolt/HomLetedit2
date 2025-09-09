const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const User = require('../models/User');
const Contact = require('../models/Contact');

// Property details
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('agent', 'fullName phone rating totalRatings');

    if (!property) {
      req.flash('error_msg', 'Property not found');
      return res.redirect('/houses');
    }

    // Increment views
    property.views += 1;
    await property.save();

    // Check if client has contacted this agent
    let hasUnlocked = false;
    if (req.session.user && req.session.user.role === 'client') {
      const contact = await Contact.findOne({
        client: req.session.user._id,
        agent: property.agent._id,
        property: property._id
      });
      hasUnlocked = !!contact;
    }

    res.render('property/details', {
      title: property.title,
      property,
      hasUnlocked
    });
  } catch (error) {
    console.error('Property details error:', error);
    req.flash('error_msg', 'Error loading property');
    res.redirect('/houses');
  }
});

module.exports = router;