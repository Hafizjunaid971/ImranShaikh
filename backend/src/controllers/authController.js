'use strict';
const jwt = require('jsonwebtoken');
const { User } = require('../models/Master');
const { asyncH, AppError } = require('../middleware');

const sign = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '30d',
  });

const shape = (u) => ({
  id: u._id,
  name: u.name,
  username: u.username,
  role: u.role,
  isActive: u.isActive,
});

exports.login = asyncH(async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username: String(username || '').toLowerCase() }).select('+passwordHash');
  if (!user || !user.isActive) throw new AppError('یوزر نیم یا پاس ورڈ غلط ہے', 401);

  const ok = await user.verifyPassword(password);
  if (!ok) throw new AppError('یوزر نیم یا پاس ورڈ غلط ہے', 401);

  user.lastLoginAt = new Date();
  await user.save();

  res.json({ ok: true, token: sign(user), user: shape(user) });
});

exports.me = asyncH(async (req, res) => res.json({ ok: true, user: shape(req.user) }));

exports.changePassword = asyncH(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(currentPassword))) throw new AppError('موجودہ پاس ورڈ غلط ہے', 400);
  await user.setPassword(newPassword);
  await user.save();
  res.json({ ok: true, message: 'پاس ورڈ تبدیل ہو گیا' });
});

exports.listUsers = asyncH(async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  res.json({ ok: true, data: users.map(shape) });
});

exports.createUser = asyncH(async (req, res) => {
  const { name, username, password, role } = req.body;
  const user = new User({ name, username, role });
  await user.setPassword(password);
  await user.save();
  res.status(201).json({ ok: true, data: shape(user) });
});

exports.updateUser = asyncH(async (req, res) => {
  const { name, role, isActive, password } = req.body;
  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw new AppError('یوزر نہیں ملا', 404);
  if (name !== undefined) user.name = name;
  if (role !== undefined) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (password) await user.setPassword(password);
  await user.save();
  res.json({ ok: true, data: shape(user) });
});
