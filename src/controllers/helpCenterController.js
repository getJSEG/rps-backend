const helpCenterRepository = require('../repositories/helpCenterRepository');

function parseId(raw) {
  const id = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parseText(value, label, max, { required }) {
  if (value === undefined) return required ? { error: `${label} is required.` } : { value: undefined };
  const text = String(value ?? '').trim();
  if (!text) return { error: `${label} is required.` };
  if (text.length > max) return { error: `${label} must be at most ${max} characters.` };
  return { value: text };
}

function parseIdList(raw) {
  if (!Array.isArray(raw)) return null;
  const ids = raw.map(parseId);
  return ids.every((id) => id != null) ? ids : null;
}

function sendServerError(res, label, error) {
  console.error(`${label}:`, error);
  res.status(500).json({ message: 'Help Center request failed' });
}

/** Public: active categories with their active questions. Empty categories are left out. */
const getHelpCenter = async (req, res) => {
  try {
    const categories = await helpCenterRepository.listCategoriesWithFaqs({ activeOnly: true });
    res.json({ categories: categories.filter((c) => c.faqs.length > 0) });
  } catch (error) {
    sendServerError(res, 'getHelpCenter', error);
  }
};

const getHelpCenterAdmin = async (req, res) => {
  try {
    res.json({ categories: await helpCenterRepository.listCategoriesWithFaqs() });
  } catch (error) {
    sendServerError(res, 'getHelpCenterAdmin', error);
  }
};

const createCategoryAdmin = async (req, res) => {
  try {
    const name = parseText(req.body?.name, 'Category name', 120, { required: true });
    if (name.error) return res.status(400).json({ message: name.error });
    const category = await helpCenterRepository.createCategory({
      name: name.value,
      isActive: req.body?.isActive !== false,
    });
    res.status(201).json({ category });
  } catch (error) {
    sendServerError(res, 'createCategoryAdmin', error);
  }
};

const updateCategoryAdmin = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid category id' });
    const name = parseText(req.body?.name, 'Category name', 120, { required: false });
    if (name.error) return res.status(400).json({ message: name.error });
    const isActive = req.body?.isActive === undefined ? undefined : !!req.body.isActive;
    const category = await helpCenterRepository.updateCategory(id, { name: name.value, isActive });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json({ category });
  } catch (error) {
    sendServerError(res, 'updateCategoryAdmin', error);
  }
};

const deleteCategoryAdmin = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid category id' });
    const deleted = await helpCenterRepository.deleteCategory(id);
    if (!deleted) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    sendServerError(res, 'deleteCategoryAdmin', error);
  }
};

const reorderCategoriesAdmin = async (req, res) => {
  try {
    const ids = parseIdList(req.body?.ids);
    if (!ids) return res.status(400).json({ message: 'ids must be a list of category ids' });
    await helpCenterRepository.reorderCategories(ids);
    res.json({ categories: await helpCenterRepository.listCategoriesWithFaqs() });
  } catch (error) {
    sendServerError(res, 'reorderCategoriesAdmin', error);
  }
};

const createFaqAdmin = async (req, res) => {
  try {
    const categoryId = parseId(req.body?.categoryId);
    if (!categoryId || !(await helpCenterRepository.categoryExists(categoryId))) {
      return res.status(400).json({ message: 'Choose a valid category.' });
    }
    const question = parseText(req.body?.question, 'Question', 500, { required: true });
    if (question.error) return res.status(400).json({ message: question.error });
    const answer = parseText(req.body?.answer, 'Answer', 10000, { required: true });
    if (answer.error) return res.status(400).json({ message: answer.error });
    const faq = await helpCenterRepository.createFaq({
      categoryId,
      question: question.value,
      answer: answer.value,
      isActive: req.body?.isActive !== false,
    });
    res.status(201).json({ faq });
  } catch (error) {
    sendServerError(res, 'createFaqAdmin', error);
  }
};

const updateFaqAdmin = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid question id' });
    let categoryId;
    if (req.body?.categoryId !== undefined) {
      categoryId = parseId(req.body.categoryId);
      if (!categoryId || !(await helpCenterRepository.categoryExists(categoryId))) {
        return res.status(400).json({ message: 'Choose a valid category.' });
      }
    }
    const question = parseText(req.body?.question, 'Question', 500, { required: false });
    if (question.error) return res.status(400).json({ message: question.error });
    const answer = parseText(req.body?.answer, 'Answer', 10000, { required: false });
    if (answer.error) return res.status(400).json({ message: answer.error });
    const isActive = req.body?.isActive === undefined ? undefined : !!req.body.isActive;
    const faq = await helpCenterRepository.updateFaq(id, {
      categoryId,
      question: question.value,
      answer: answer.value,
      isActive,
    });
    if (!faq) return res.status(404).json({ message: 'Question not found' });
    res.json({ faq });
  } catch (error) {
    sendServerError(res, 'updateFaqAdmin', error);
  }
};

const deleteFaqAdmin = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid question id' });
    const deleted = await helpCenterRepository.deleteFaq(id);
    if (!deleted) return res.status(404).json({ message: 'Question not found' });
    res.json({ message: 'Question deleted' });
  } catch (error) {
    sendServerError(res, 'deleteFaqAdmin', error);
  }
};

const reorderFaqsAdmin = async (req, res) => {
  try {
    const categoryId = parseId(req.params.id);
    if (!categoryId) return res.status(400).json({ message: 'Invalid category id' });
    const ids = parseIdList(req.body?.ids);
    if (!ids) return res.status(400).json({ message: 'ids must be a list of question ids' });
    await helpCenterRepository.reorderFaqs(categoryId, ids);
    res.json({ categories: await helpCenterRepository.listCategoriesWithFaqs() });
  } catch (error) {
    sendServerError(res, 'reorderFaqsAdmin', error);
  }
};

module.exports = {
  getHelpCenter,
  getHelpCenterAdmin,
  createCategoryAdmin,
  updateCategoryAdmin,
  deleteCategoryAdmin,
  reorderCategoriesAdmin,
  createFaqAdmin,
  updateFaqAdmin,
  deleteFaqAdmin,
  reorderFaqsAdmin,
};
