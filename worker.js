import { Router } from 'itty-router';
import sanitizeHtml from 'sanitize-html';

const router = Router();

// 定义 CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS,DELETE",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// 处理 OPTIONS 请求
router.options("*", () => {
  return new Response(null, {
    headers: corsHeaders
  });
});

// 初始化数据库表
const initDB = async (env) => {
  if (!env.DB) {
    throw new Error('D1数据库未绑定，请检查wrangler.toml配置');
  }
  
  try {
    // 修改文章表创建语句
    const createPostsTable = `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      cover_image TEXT,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delete_password TEXT NOT NULL
    )`;
    
    // 修改评论表创建语句
    const createCommentsTable = `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      email TEXT,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delete_password TEXT NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )`;
    
    await env.DB.prepare(createPostsTable).run();
    await env.DB.prepare(createCommentsTable).run();
    console.log('数据库表初始化成功');
  } catch (e) {
    console.error('数据库初始化失败:', e);
    throw new Error(`数据库错误: ${e.message}`);
  }
};

// 从KV获取静态资源
const getKVAsset = async (env, key) => {
  if (!env.PUBLIC_ASSETS) {
    throw new Error('KV命名空间未绑定，请检查wrangler.toml配置');
  }
  
  try {
    const content = await env.PUBLIC_ASSETS.get(key, { type: "text" });
    if (!content) {
      throw new Error(`资源 "${key}" 不存在于KV中`);
    }
    return content;
  } catch (e) {
    console.error(`获取KV资源 "${key}" 失败:`, e);
    throw e;
  }
};

// 静态页面处理函数
const handleStaticPage = async (page, env, needInitDB = false) => {
  try {
    if (needInitDB) {
      const isInitialized = await checkTableExists(env);
      if (!isInitialized) {
        await initDB(env);
      }
    }
    const htmlContent = await getKVAsset(env, page);
    return new Response(htmlContent, {
      headers: { 
        ...corsHeaders,
        'Content-Type': 'text/html; charset=UTF-8' 
      }
    });
  } catch (e) {
    return new Response(`${page}加载失败: ${e.message}`, { 
      status: 404,
      headers: corsHeaders
    });
  }
};

// 检查表是否已存在的辅助函数
const checkTableExists = async (env) => {
  try {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='posts'"
    ).all();
    return results.length > 0;
  } catch (e) {
    console.error('检查表是否存在失败:', e);
    return false;
  }
};

// 路由配置
router.get('/', (request, env) => handleStaticPage('index.html', env, true));
router.get('/index.html', (request, env) => handleStaticPage('index.html', env, true));
router.get('/404.html', (request, env) => handleStaticPage('404.html', env));
router.get('/about.html', (request, env) => handleStaticPage('about.html', env));
router.get('/cert.html', (request, env) => handleStaticPage('cert.html', env));
router.get('/new-post.html', (request, env) => handleStaticPage('new-post.html', env));
router.get('/post.html', (request, env) => handleStaticPage('post.html', env));
router.get('/posts.html', (request, env) => handleStaticPage('posts.html', env));
router.get('/contact.html', (request, env) => handleStaticPage('contact.html', env));

router.get('/about', (request, env) => handleStaticPage('about.html', env));
router.get('/cert', (request, env) => handleStaticPage('cert.html', env));
router.get('/new-post', (request, env) => handleStaticPage('new-post.html', env));
router.get('/post', (request, env) => handleStaticPage('post.html', env));
router.get('/posts', (request, env) => handleStaticPage('posts.html', env));
router.get('/contact', (request, env) => handleStaticPage('contact.html', env));

router.get('/post/:id', (request, env) => handleStaticPage('post.html', env));

// API接口
router.get('/api/posts', async (request, env) => {
  try {
    const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY created_at DESC').all();
    return new Response(JSON.stringify({
      success: true,
      data: results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e.message
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

router.get('/api/posts/:id', async (request, env) => {
  try {
    const { id } = request.params;
    const { results } = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).all();
    
    if (results.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: '文章不存在'
      }), { 
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      data: results[0]
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e.message
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

router.post('/api/posts', async (request, env) => {
  try {
    // 只接收必要的字段
    const { title, category, excerpt, content, delete_password } = await request.json();
    
    // 防XSS处理
    const sanitizedTitle = sanitizeHtml(title);
    const sanitizedCategory = sanitizeHtml(category);
    const sanitizedExcerpt = sanitizeHtml(excerpt);
    const sanitizedContent = sanitizeHtml(content);
    const sanitizedDeletePassword = sanitizeHtml(delete_password);
    
    // 使用数据库的默认时间戳，移除 publish_date
    const { success } = await env.DB.prepare(
      `INSERT INTO posts 
       (title, category, excerpt, content, delete_password) 
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      sanitizedTitle, 
      sanitizedCategory, 
      sanitizedExcerpt, 
      sanitizedContent,
      sanitizedDeletePassword
    )
    .run();
    
    return new Response(JSON.stringify({
      success: success,
      message: success ? '创建成功' : '创建失败'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    // 添加详细的错误日志
    console.error('创建文章失败:', e);
    return new Response(JSON.stringify({
      success: false,
      message: e.message
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

router.delete('/api/posts/:id', async (request, env) => {
  try {
    const { id } = request.params;
    const { deletePassword } = await request.json();
    
    // 从数据库中获取文章的删除密码
    const postResult = await env.DB.prepare('SELECT delete_password FROM posts WHERE id = ?').bind(id).first();
    
    if (!postResult) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '文章不存在' 
      }), { 
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 验证密码
    if (deletePassword !== postResult.delete_password) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '密码错误' 
      }), { 
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    const { success } = await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ 
      success: success,
      message: success ? '删除成功' : '删除失败'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: e.message 
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

router.get('/api/categories', async (request, env) => {
  try {
    const { results } = await env.DB.prepare(
      `SELECT category, COUNT(*) as count 
       FROM posts 
       GROUP BY category`
    ).all();
    
    return new Response(JSON.stringify({
      success: true,
      data: results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e.message
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

// 评论相关API
router.get('/api/posts/:id/comments', async (request, env) => {
  try {
    const { id } = request.params;
    const { results } = await env.DB.prepare(
      'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at DESC'
    ).bind(id).all();
    
    return new Response(JSON.stringify({
      success: true,
      data: results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e.message
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

router.post('/api/posts/:id/comments', async (request, env) => {
  try {
    const { id } = request.params;
    // 添加delete_password字段
    const { author, email, content, delete_password } = await request.json();
    
    // 验证数据
    if (!author || !content) {
      return new Response(JSON.stringify({
        success: false,
        message: '作者和评论内容不能为空'
      }), { 
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 防XSS处理
    const sanitizedAuthor = sanitizeHtml(author);
    const sanitizedEmail = email ? sanitizeHtml(email) : null;
    const sanitizedContent = sanitizeHtml(content);
    const sanitizedDeletePassword = sanitizeHtml(delete_password);
    
    // 检查文章是否存在
    const { results: postResults } = await env.DB.prepare(
      'SELECT id FROM posts WHERE id = ?'
    ).bind(id).all();
    
    if (postResults.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: '文章不存在'
      }), { 
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 添加评论（包含删除密码）
    const { success } = await env.DB.prepare(
      'INSERT INTO comments (post_id, author, email, content, delete_password) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(id, sanitizedAuthor, sanitizedEmail, sanitizedContent, sanitizedDeletePassword)
    .run();
    
    return new Response(JSON.stringify({
      success: success,
      message: success ? '评论成功' : '评论失败'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e.message
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

// 添加评论删除API
router.delete('/api/comments/:id', async (request, env) => {
  try {
    const { id } = request.params;
    const { deletePassword } = await request.json();
    
    // 从数据库获取评论的删除密码
    const commentResult = await env.DB.prepare('SELECT delete_password FROM comments WHERE id = ?').bind(id).first();
    
    if (!commentResult) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '评论不存在' 
      }), { 
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 验证密码
    if (deletePassword !== commentResult.delete_password) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '密码错误' 
      }), { 
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 删除评论
    const { success } = await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
    
    return new Response(JSON.stringify({ 
      success: success,
      message: success ? '删除成功' : '删除失败'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: e.message 
    }), { 
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

router.all('*', async (request) => {
  const url = new URL(request.url);
  return new Response(`页面未找到: ${url.pathname}`, { 
    status: 404,
    headers: corsHeaders
  });
});

export default {
  fetch: (request, env, ctx) => router.handle(request, env, ctx)
};