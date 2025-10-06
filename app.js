// Kiko Social - Modern Social Media Platform
// Complete JavaScript Application with Firebase Integration

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    set,
    get,
    update,
    remove,
    onValue,
    serverTimestamp,
    query,
    orderByChild,
    limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAe_ZfZ8rKCke47UeA9Kcs8cXpD6-G6RAQ",
    authDomain: "kiko-chat-b6435.firebaseapp.com",
    databaseURL: "https://kiko-chat-b6435-default-rtdb.firebaseio.com",
    projectId: "kiko-chat-b6435",
    storageBucket: "kiko-chat-b6435.appspot.com",
    messagingSenderId: "896370793240",
    appId: "1:896370793240:web:3f14442a5d80cd71fb1c6d",
    measurementId: "G-FB55ZBH15N"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);

// Application State
class KikoSocialApp {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.currentPage = 'feed';
        this.theme = localStorage.getItem('kiko-theme') || 'dark';
        this.posts = [];
        this.users = [];
        this.notifications = [];
        this.conversations = [];

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.applyTheme();
        this.showLoadingScreen();

        // Monitor authentication state
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.handleUserLogin(user);
            } else {
                this.handleUserLogout();
            }
        });

        // Simulate loading time
        setTimeout(() => {
            this.hideLoadingScreen();
        }, 2000);
    }

    // Authentication Methods
    async handleUserLogin(user) {
        this.currentUser = user;

        // Check if user is admin
        this.isAdmin = await this.checkAdminStatus(user.email);

        // Update user presence
        await this.updateUserPresence(user.uid, true);

        // Load user data
        await this.loadUserData(user.uid);

        this.showMainApp();
        this.loadFeed();
        this.loadNotifications();

        this.showToast('success', 'Welcome back!', `You're now signed in as ${user.email}`);
    }

    async handleUserLogout() {
        if (this.currentUser) {
            await this.updateUserPresence(this.currentUser.uid, false);
        }

        this.currentUser = null;
        this.isAdmin = false;
        this.showAuthPage();
    }

    async checkAdminStatus(email) {
        try {
            const adminRef = ref(database, `admins/${email.replace('.', '_').replace('@', '_at_')}`);
            const snapshot = await get(adminRef);
            return snapshot.exists();
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }

    async signIn(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    }

    async createUser(userData) {
        if (!this.isAdmin) {
            throw new Error('Only administrators can create users');
        }

        try {
            // Create authentication account
            const userCredential = await createUserWithEmailAndPassword(
                auth, 
                userData.email, 
                userData.password
            );

            // Update profile
            await updateProfile(userCredential.user, {
                displayName: userData.name
            });

            // Save user data to database
            const userRef = ref(database, `users/${userCredential.user.uid}`);
            await set(userRef, {
                uid: userCredential.user.uid,
                email: userData.email,
                name: userData.name,
                username: userData.username,
                bio: userData.bio || '',
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=667eea&color=fff`,
                followers: 0,
                following: 0,
                posts: 0,
                isOnline: false,
                lastSeen: serverTimestamp(),
                joined: serverTimestamp(),
                isActive: true
            });

            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Create user error:', error);
            return { success: false, error: error.message };
        }
    }

    async signOutUser() {
        try {
            await signOut(auth);
            this.showToast('info', 'Signed out', 'You have been successfully signed out');
        } catch (error) {
            console.error('Sign out error:', error);
            this.showToast('error', 'Error', 'Failed to sign out');
        }
    }

    // User Data Methods
    async loadUserData(uid) {
        try {
            const userRef = ref(database, `users/${uid}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                this.updateUserUI(userData);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async updateUserPresence(uid, isOnline) {
        try {
            const userRef = ref(database, `users/${uid}`);
            await update(userRef, {
                isOnline: isOnline,
                lastSeen: serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating user presence:', error);
        }
    }

    // Post Methods
    async createPost(content, imageUrl = null) {
        if (!this.currentUser) return;

        try {
            const postRef = push(ref(database, 'posts'));
            const postData = {
                id: postRef.key,
                authorId: this.currentUser.uid,
                content: content,
                image: imageUrl,
                timestamp: serverTimestamp(),
                likes: 0,
                comments: 0,
                shares: 0,
                hashtags: this.extractHashtags(content),
                isActive: true
            };

            await set(postRef, postData);

            // Update user post count
            const userRef = ref(database, `users/${this.currentUser.uid}`);
            const userSnapshot = await get(userRef);
            if (userSnapshot.exists()) {
                const currentPosts = userSnapshot.val().posts || 0;
                await update(userRef, { posts: currentPosts + 1 });
            }

            this.showToast('success', 'Post created!', 'Your post has been shared successfully');
            this.loadFeed();
        } catch (error) {
            console.error('Error creating post:', error);
            this.showToast('error', 'Error', 'Failed to create post');
        }
    }

    async loadFeed() {
        try {
            const postsRef = query(ref(database, 'posts'), orderByChild('timestamp'), limitToLast(20));
            const snapshot = await get(postsRef);

            if (snapshot.exists()) {
                const posts = [];
                snapshot.forEach((childSnapshot) => {
                    const post = childSnapshot.val();
                    if (post.isActive) {
                        posts.unshift(post); // Add to beginning for chronological order
                    }
                });

                this.posts = posts;
                await this.renderFeed();
            }
        } catch (error) {
            console.error('Error loading feed:', error);
        }
    }

    async renderFeed() {
        const feedContainer = document.getElementById('posts-feed');
        if (!feedContainer) return;

        feedContainer.innerHTML = '';

        for (const post of this.posts) {
            const authorData = await this.getUserData(post.authorId);
            if (!authorData) continue;

            const postElement = this.createPostElement(post, authorData);
            feedContainer.appendChild(postElement);
        }
    }

    createPostElement(post, author) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post';
        postDiv.innerHTML = `
            <div class="post-header">
                <img src="${author.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(author.name)}" alt="${author.name}" class="post-avatar">
                <div class="post-author">
                    <h4>${author.name}</h4>
                    <p>@${author.username || author.name.toLowerCase().replace(/\s+/g, '')}</p>
                </div>
                <span class="post-time">${this.formatTimestamp(post.timestamp)}</span>
            </div>
            <div class="post-content">
                ${post.content}
            </div>
            ${post.image ? `<img src="${post.image}" alt="Post image" class="post-image">` : ''}
            ${post.hashtags && post.hashtags.length > 0 ? `
                <div class="post-hashtags">
                    ${post.hashtags.map(tag => `<a href="#" class="hashtag-link">#${tag}</a>`).join(' ')}
                </div>
            ` : ''}
            <div class="post-actions">
                <button class="action-btn like-btn" data-post-id="${post.id}">
                    <i class="fas fa-heart"></i>
                    <span>${post.likes || 0}</span>
                </button>
                <button class="action-btn comment-btn" data-post-id="${post.id}">
                    <i class="fas fa-comment"></i>
                    <span>${post.comments || 0}</span>
                </button>
                <button class="action-btn share-btn" data-post-id="${post.id}">
                    <i class="fas fa-share"></i>
                    <span>${post.shares || 0}</span>
                </button>
                <button class="action-btn bookmark-btn" data-post-id="${post.id}">
                    <i class="fas fa-bookmark"></i>
                </button>
            </div>
        `;

        return postDiv;
    }

    // User Management (Admin Only)
    async loadUsers() {
        if (!this.isAdmin) return;

        try {
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);

            if (snapshot.exists()) {
                this.users = Object.values(snapshot.val());
                this.renderUsersTable();
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    renderUsersTable() {
        const usersList = document.getElementById('users-list');
        if (!usersList) return;

        usersList.innerHTML = '';

        this.users.forEach(user => {
            const userRow = document.createElement('div');
            userRow.className = 'user-row';
            userRow.innerHTML = `
                <div class="user-info">
                    <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name)}" alt="${user.name}">
                    <div>
                        <h4>${user.name}</h4>
                        <p>@${user.username || user.name.toLowerCase().replace(/\s+/g, '')}</p>
                    </div>
                </div>
                <div>${user.email}</div>
                <div>${this.formatDate(user.joined)}</div>
                <div>
                    <span class="status-badge ${user.isActive ? 'status-active' : 'status-inactive'}">
                        ${user.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
                <div class="user-actions">
                    <button class="btn btn-secondary btn-sm edit-user-btn" data-user-id="${user.uid}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm delete-user-btn" data-user-id="${user.uid}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            usersList.appendChild(userRow);
        });
    }

    // Utility Methods
    async getUserData(uid) {
        try {
            const userRef = ref(database, `users/${uid}`);
            const snapshot = await get(userRef);
            return snapshot.exists() ? snapshot.val() : null;
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }

    extractHashtags(text) {
        const hashtagRegex = /#(\w+)/g;
        const hashtags = [];
        let match;

        while ((match = hashtagRegex.exec(text)) !== null) {
            hashtags.push(match[1].toLowerCase());
        }

        return hashtags;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Just now';

        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

        return date.toLocaleDateString();
    }

    formatDate(timestamp) {
        if (!timestamp) return 'Unknown';
        return new Date(timestamp).toLocaleDateString();
    }

    // UI Methods
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('fade-out');
        }
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    showAuthPage() {
        document.getElementById('auth-page').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('auth-page').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
    }

    updateUserUI(userData) {
        const userNameElement = document.getElementById('user-name');
        const userEmailElement = document.getElementById('user-email');

        if (userNameElement) userNameElement.textContent = userData.name;
        if (userEmailElement) userEmailElement.textContent = userData.email;

        // Show/hide admin elements
        const adminElements = document.querySelectorAll('[data-admin-only]');
        adminElements.forEach(el => {
            el.style.display = this.isAdmin ? 'block' : 'none';
        });

        const adminPanelBtn = document.getElementById('admin-panel-btn');
        if (adminPanelBtn) {
            adminPanelBtn.style.display = this.isAdmin ? 'flex' : 'none';
        }
    }

    // Navigation Methods
    showPage(pageId) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // Show selected page
        const targetPage = document.getElementById(`${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeNavItem = document.querySelector(`[data-page="${pageId}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        this.currentPage = pageId;

        // Load page-specific content
        if (pageId === 'admin' && this.isAdmin) {
            this.loadUsers();
            this.loadAnalytics();
        }
    }

    // Theme Methods
    applyTheme() {
        document.body.setAttribute('data-theme', this.theme);
        const themeIcon = document.querySelector('#theme-toggle i');
        if (themeIcon) {
            themeIcon.className = this.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('kiko-theme', this.theme);
        this.applyTheme();
    }

    // Modal Methods
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    // Toast Notifications
    showToast(type, title, message) {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle',
            warning: 'fas fa-exclamation-triangle'
        };

        toast.innerHTML = `
            <i class="${icons[type]} toast-icon"></i>
            <div class="toast-content">
                <h4>${title}</h4>
                <p>${message}</p>
            </div>
            <button class="toast-close">&times;</button>
        `;

        toastContainer.appendChild(toast);

        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);

        // Manual close
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
    }

    // Analytics Methods
    async loadAnalytics() {
        if (!this.isAdmin) return;

        try {
            const analyticsRef = ref(database, 'analytics');
            const snapshot = await get(analyticsRef);

            if (snapshot.exists()) {
                const data = snapshot.val();
                this.updateAnalyticsUI(data);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    updateAnalyticsUI(data) {
        const elements = {
            'total-users': data.totalUsers,
            'active-users': data.activeUsers,
            'total-posts': data.totalPosts,
            'engagement-rate': data.engagementRate + '%'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }

    // Load notifications
    async loadNotifications() {
        // Placeholder for notifications functionality
        console.log('Loading notifications...');
    }

    // Event Listeners Setup
    setupEventListeners() {
        // Authentication form
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                const result = await this.signIn(email, password);
                if (!result.success) {
                    this.showToast('error', 'Sign In Failed', result.error);
                }
            });
        }

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // User menu toggle
        const userMenuBtn = document.getElementById('user-menu-btn');
        const userDropdown = document.getElementById('user-dropdown');
        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                userDropdown.classList.remove('show');
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.signOutUser();
            });
        }

        // Navigation items
        document.querySelectorAll('[data-page]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.showPage(page);
            });
        });

        // Post composer
        const publishBtn = document.getElementById('publish-btn');
        const postContent = document.getElementById('post-content');
        if (publishBtn && postContent) {
            publishBtn.addEventListener('click', async () => {
                const content = postContent.value.trim();
                if (content) {
                    await this.createPost(content);
                    postContent.value = '';
                }
            });
        }

        // Admin panel tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');

                // Update tab buttons
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update tab content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const targetContent = document.getElementById(`${tab}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });

        // Create user modal
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) {
            createUserBtn.addEventListener('click', () => {
                this.showModal('create-user-modal');
            });
        }

        // Create user form
        const createUserForm = document.getElementById('create-user-form');
        if (createUserForm) {
            createUserForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const userData = {
                    name: document.getElementById('new-user-name').value,
                    username: document.getElementById('new-user-username').value,
                    email: document.getElementById('new-user-email').value,
                    password: document.getElementById('new-user-password').value,
                    bio: document.getElementById('new-user-bio').value
                };

                const result = await this.createUser(userData);
                if (result.success) {
                    this.hideModal('create-user-modal');
                    this.showToast('success', 'User Created', `Successfully created user: ${userData.name}`);
                    createUserForm.reset();
                    this.loadUsers();
                } else {
                    this.showToast('error', 'Creation Failed', result.error);
                }
            });
        }

        // Modal close buttons
        document.querySelectorAll('.modal-close, [data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.classList.remove('show');
                });
                document.body.style.overflow = '';
            });
        });

        // Modal backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                    document.body.style.overflow = '';
                }
            });
        });
    }
}

// Initialize the application
const kikoApp = new KikoSocialApp();

// Export for debugging
window.KikoSocialApp = kikoApp;
