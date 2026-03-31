const fs = require('fs');

function patchFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

// 1. Patch app.js
const appJsReplacer = (content) => {
    const targetBtn = '<button class="btn btn-secondary btn-sm" onclick="viewJobDetails(\\'${job._id}\\')">📊 View Report</button>';
    const newBtns = '<button class="btn btn-secondary btn-sm" onclick="editJob(\\'${job._id}\\')">✏️ Edit</button>\\n<button class="btn btn-danger btn-sm" onclick="deleteJob(\\'${job._id}\\')" style="background:var(--danger)">🗑️ Delete</button>\\n' + targetBtn;
    
    if (!content.includes('editJob(')) {
        content = content.replace(targetBtn, newBtns);
    }
    
    if (!content.includes('window.deleteJob')) {
        const jsCode = `
window.deleteJob = async (jobId) => {
    if (!confirm('Are you absolutely sure you want to completely delete this job and all its applicants/data?')) return;
    showLoading('Deleting Job...');
    try {
        await apiCall('/jobs/' + jobId, 'DELETE');
        showToast('Job deleted perfectly', 'success');
        loadAdminDashboard();
    } catch (e) {
        showToast('Error deleting job', 'error');
    } finally {
        hideLoading();
    }
};

window.editJob = async (jobId) => {
    showLoading('Loading job...');
    try {
        const job = await apiCall('/jobs/' + jobId);
        
        document.getElementById('editJobId').value = job._id;
        document.getElementById('editJobTitle').value = job.title;
        document.getElementById('editJobDescription').value = job.description;
        document.getElementById('editJobCompany').value = job.company;
        document.getElementById('editJobPositions').value = job.totalPositions;
        document.getElementById('editJobMaxApplicants').value = job.maxApplicants;
        document.getElementById('editJobSkills').value = job.requiredSkills.join(', ');
        document.getElementById('editJobExperience').value = job.experience;
        document.getElementById('editJobEducation').value = job.education;
        document.getElementById('editJobStartDate').value = job.startDate ? job.startDate.substring(0,10) : '';
        document.getElementById('editJobEndDate').value = job.endDate ? job.endDate.substring(0,10) : '';
        
        if (job.eliminationRatios) {
            document.getElementById('editRatioAts').value = job.eliminationRatios.ats || 50;
            document.getElementById('editRatioAptitude').value = job.eliminationRatios.aptitude || 50;
            document.getElementById('editRatioTechnical').value = job.eliminationRatios.technical || 50;
            document.getElementById('editRatioGd').value = job.eliminationRatios.gd || 50;
        }

        hideLoading();
        openModal('editJobModal');
    } catch (e) {
        hideLoading();
        showToast('Error loading job details', 'error');
    }
};

window.handleUpdateJob = async (e) => {
    e.preventDefault();
    const jobId = document.getElementById('editJobId').value;
    const startDateVal = document.getElementById('editJobStartDate').value;
    const endDateVal = document.getElementById('editJobEndDate').value;
    
    if (!startDateVal || !endDateVal || new Date(startDateVal) >= new Date(endDateVal)) {
        return showToast('End Date must be after Start Date.', 'error');
    }

    showLoading('Updating job...');
    const payload = {
        title: document.getElementById('editJobTitle').value,
        description: document.getElementById('editJobDescription').value,
        company: document.getElementById('editJobCompany').value,
        totalPositions: parseInt(document.getElementById('editJobPositions').value),
        maxApplicants: parseInt(document.getElementById('editJobMaxApplicants').value) || 100,
        requiredSkills: document.getElementById('editJobSkills').value.split(',').map(s => s.trim()),
        experience: document.getElementById('editJobExperience').value || 0,
        education: document.getElementById('editJobEducation').value,
        startDate: startDateVal,
        endDate: endDateVal,
        eliminationRatios: {
            ats: parseInt(document.getElementById('editRatioAts').value),
            aptitude: parseInt(document.getElementById('editRatioAptitude').value),
            technical: parseInt(document.getElementById('editRatioTechnical').value),
            gd: parseInt(document.getElementById('editRatioGd').value)
        }
    };

    try {
        await apiCall('/jobs/' + jobId, 'PUT', payload);
        closeModal('editJobModal');
        showToast('Job updated successfully!', 'success');
        loadAdminDashboard();
    } catch (error) {
    } finally {
        hideLoading();
    }
};
`;
        content = content.replace('window.handleCreateJob = async (e) => {', jsCode + '\\n\\nwindow.handleCreateJob = async (e) => {')
    }
    return content;
};

patchFile('d:/interview/public/js/app.js', appJsReplacer);
patchFile('d:/interview/mobile-app/public/js/app.js', appJsReplacer);

// 2. Patch HTML
const htmlReplacer = (html) => {
    if (!html.includes('editJobModal')) {
        const createModalRegex = /<div class="modal" id="createJobModal">[\\s\\S]*?<\\/div>[\\s\\S]*?<\\/div>\\s*<\\/div>/g;
        const match = html.match(createModalRegex);
        if(match) {
            let editModal = match[0].replace('id="createJobModal"', 'id="editJobModal"')
                                   .replace('<h2>Create New Job</h2>', '<h2>Edit Job Entry</h2>')
                                   .replace('onsubmit="handleCreateJob(event)"', 'onsubmit="handleUpdateJob(event)"')
                                   .replace('id="jobTitle"', 'id="editJobTitle"')
                                   .replace('id="jobDescription"', 'id="editJobDescription"')
                                   .replace('id="jobCompany"', 'id="editJobCompany"')
                                   .replace('id="jobPositions"', 'id="editJobPositions"')
                                   .replace('id="jobMaxApplicants"', 'id="editJobMaxApplicants"')
                                   .replace('id="jobSkills"', 'id="editJobSkills"')
                                   .replace('id="jobExperience"', 'id="editJobExperience"')
                                   .replace('id="jobEducation"', 'id="editJobEducation"')
                                   .replace('id="jobStartDate"', 'id="editJobStartDate"')
                                   .replace('id="jobEndDate"', 'id="editJobEndDate"')
                                   .replace('id="ratioAts"', 'id="editRatioAts"')
                                   .replace('id="ratioAptitude"', 'id="editRatioAptitude"')
                                   .replace('id="ratioTechnical"', 'id="editRatioTechnical"')
                                   .replace('id="ratioGd"', 'id="editRatioGd"')
                                   .replace('Create Job', 'Update Job');
                                   
            // Add hidden input for Job ID
            editModal = editModal.replace('<form', '<form>\\n                <input type="hidden" id="editJobId">');
            
            html = html.replace(match[0], match[0] + '\\n\\n' + editModal);
        }
    }
    return html;
};

patchFile('d:/interview/public/index.html', htmlReplacer);
patchFile('d:/interview/mobile-app/public/index.html', htmlReplacer);

console.log("PATCH COMPLETE");
