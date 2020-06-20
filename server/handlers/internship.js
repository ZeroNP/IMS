const db = require("../models");
const chain = require("./chain");
let nodemailer = require("nodemailer");
let transport = require("nodemailer-smtp-transport");
require("dotenv").config();

//mailing options and transportor
var options = {
  service: "gmail",
  auth: {
    user: process.env.EMAILFROM,
    pass: process.env.PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
};
let client = nodemailer.createTransport(transport(options));

exports.addNewInternship = async (req, res, next) => {
  const { id } = req.decoded;
  const { application } = req.body;
  try {
    const student = await db.Student.findById(id);
    const internship = await db.Internship.create({
      student,
      application,
    });
    const faculty = await db.Faculty.findOne({
      currentClass: {
        year: student.currentClass.year,
        div: student.currentClass.div,
      },
    });
    internship.holder = { id: faculty._id, designation: faculty.designation };

    faculty.applicationsReceived.push(internship._id);
    student.internships.push(internship._id);
    await student.save();
    await faculty.save();
    await internship.save();
    var email = {
      from: process.env.EMAILFROM,
      to: student.emailId,
      subject: "New Application Created!",
      html:
        "New Internship Application for <b>" +
        application.durationOfInternship +
        " months</b> at <b>" +
        application.workplace +
        "</b> created on <b>" +
        new Date().toDateString() +
        "</b>. <br /><br /> Your application is currently held by: Prof. <b>" +
        faculty.name.firstname +
        " " +
        faculty.name.lastname +
        "</b>. <br /><br /> <a href='https://localhost:3000'>Click here to login and check.</a>",
    };
    client.sendMail(email, (err, info) => {
      if (err) {
        console.log(err);
      } else if (info) {
        console.log(info);
      }
    });

    return res.status(201).json({ ...internship._doc, student: student._id });
  } catch (err) {
    console.log(err);
    next({
      status: 400,
      message: err.message,
    });
  }
};

exports.showInternships = async (req, res, next) => {
  try {
    //const internships = await db.internships.find().populate('student',['studentname','id']);
    const internships = await db.Internship.find().populate("internships");
    res.status(200).json(internships);
  } catch (err) {
    err.status(400);
    next(err);
  }
};

exports.studentsInternships = async (req, res, next) => {
  try {
    const { id } = req.decoded;
    const student = await db.Student.findById(id).populate("internships");
    res.status(200).json(student.internships);
  } catch (err) {
    return next({
      status: 400,
      message: err.message,
    });
  }
};

exports.getInternship = async (req, res, next) => {
  try {
    const { id } = req.params;

    const internship = await db.Internship.findById(id).populate("student", [
      "name",
      "currentClass",
      "prevSemAttendance",
      "marksheets",
      "rollNo",
    ]);
    if (!internship) {
      throw new Error("No internship found");
    }

    res.status(200).json(internship);
  } catch (err) {
    next({
      status: 400,
      message: err.message,
    });
  }
};

exports.deleteInternship = async (req, res, next) => {
  const { id: internshipId } = req.params;
  const { id: studentId } = req.decoded;
  try {
    let student = await db.Student.findById(studentId);
    if (student.internships) {
      // not sure if necessary either...
      student.internships = student.internships.filter((studentInternship) => {
        return studentInternship._id.toString() !== internshipId.toString(); // not sure if necessary to use toString()
      });
    }

    const internship = await db.Internship.findById(internshipId);
    if (!internship) throw new Error("No internship found");
    if (internship.student.toString() !== studentId) {
      throw new Error("Unauthorized access");
    }
    await student.save();
    await internship.remove();
    return res.status(202).json({ internship, deleted: true });
  } catch (err) {
    return next({
      status: 400,
      message: err.message,
    });
  }
};

exports.updateInternship = async (req, res, next) => {
  try {
    const { id } = req.params;
    const details = req.body;
    let internship = await db.Internship.findById(id);

    for (var key of Object.keys(details)) {
      internship[key.toString()] = details[key];
    }
    await internship.save();
    //console.log(internship);
    res.status(200).json(internship);
  } catch (err) {
    err.message = "Could not update";
    next(err);
  }
};

exports.approveInternship = async (req, res, next) => {
  const { id: internshipId } = req.params;
  const { id: facultyId } = req.decoded;
  try {
    let internship = await db.Internship.findById(internshipId);
    internship["completionStatus"] = "Approved";
    let faculty = await db.Faculty.findById(facultyId);
    faculty["applicationsApproved"].push(internshipId);
    await faculty.save();
    await internship.save();
    res.status(200).json(internship);
  } catch (err) {
    err.message = "Could not approve";
    next(err);
  }
};

exports.forwardInternship = async (req, res, next) => {
  const { id: internshipId } = req.params;
  const { id: facultyId } = req.decoded;
  try {
    let internship = await db.Internship.findById(internshipId);
    let faculty = await db.Faculty.findById(facultyId);
    faculty["applicationsApproved"].push(internshipId);
    faculty["applicationsReceived"].splice(
      faculty["applicationsReceived"].indexOf(internshipId),
      1
    );
    internship.approvedBy.push({
      id: faculty._id,
      designation: faculty.designation,
    });
    let nextPersonInChain =
      chain.acceptanceChain.indexOf(faculty.designation) + 1;
    let forwardToFaculty = db.Faculty.find({
      designation: chain.acceptanceChain[nextPersonInChain],
    });
    forwardToFaculty.applicationsReceived.push(internshipId);
    await faculty.save();
    await forwardToFaculty.save();
    await internship.save();
    res.status(200).json(internship);
  } catch (err) {
    err.message = "Could not approve";
    next(err);
  }
};
